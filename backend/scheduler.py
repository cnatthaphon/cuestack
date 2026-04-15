"""
Job scheduler — Postgres-backed queue with bounded workers.

Architecture:
  1. Cron ticker: runs every POLL_INTERVAL, evaluates cron expressions,
     enqueues due jobs into the `job_queue` table.
  2. Worker pool: N async workers pull jobs via SELECT ... FOR UPDATE SKIP LOCKED.
     Each worker picks one job, executes it, marks it done. If a job exceeds its
     timeout, the worker kills it and marks it failed.
  3. Reaper: periodic cleanup of stuck jobs (worker crashed mid-execution).

Why Postgres queue instead of Redis/Celery:
  - Zero new infrastructure — uses the existing database
  - SKIP LOCKED gives atomic, distributed job claiming
  - ACID guarantees on job state transitions
  - Scales to ~1000 jobs/minute which covers 100 orgs × 10 concurrent schedules

Scaling path: if this isn't enough, swap job_queue for BullMQ/Celery
without touching the executor code.
"""

import asyncio
import concurrent.futures
import json
import logging
import os
import re
import subprocess
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [scheduler] %(message)s"))
logger.addHandler(handler)

DATABASE_URL = os.getenv("DATABASE_URL", "")
JUPYTER_URL = os.getenv("JUPYTER_URL", "http://jupyterhub:8000")
POLL_INTERVAL = int(os.getenv("SCHEDULER_POLL_INTERVAL", "30"))
NUM_WORKERS = int(os.getenv("SCHEDULER_WORKERS", "4"))
DEFAULT_TIMEOUT = int(os.getenv("SCHEDULER_JOB_TIMEOUT", "300"))  # seconds
MAX_JOBS_PER_ORG = int(os.getenv("SCHEDULER_MAX_PER_ORG", "5"))  # concurrent per org

# Bounded thread pool for blocking subprocess calls (docker exec).
_subprocess_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=NUM_WORKERS,
    thread_name_prefix="job-exec",
)


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
def ensure_schema(conn):
    """Create job_queue and task_logs tables if they don't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_queue (
                id BIGSERIAL PRIMARY KEY,
                page_id UUID NOT NULL,
                org_id UUID NOT NULL,
                job_type VARCHAR(20) NOT NULL DEFAULT 'notebook',
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                timeout_s INTEGER NOT NULL DEFAULT 300,
                config JSONB NOT NULL DEFAULT '{}',
                task_snapshot JSONB NOT NULL DEFAULT '{}',
                claimed_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ,
                result_message TEXT,
                error TEXT,
                duration_ms INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue (status, created_at)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_job_queue_org ON job_queue (org_id, status)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_job_queue_page ON job_queue (page_id, created_at DESC)")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS task_logs (
                id BIGSERIAL PRIMARY KEY,
                page_id UUID NOT NULL,
                org_id UUID NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                message TEXT,
                duration_ms INTEGER,
                error TEXT,
                config_version INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 0")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_logs_page ON task_logs (page_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_logs_org ON task_logs (org_id, created_at DESC)")
    conn.commit()


# ---------------------------------------------------------------------------
# Cron helpers
# ---------------------------------------------------------------------------
def parse_cron(expr: str) -> dict | None:
    parts = expr.strip().split()
    if len(parts) != 5:
        return None
    return {"minute": parts[0], "hour": parts[1], "day": parts[2], "month": parts[3], "weekday": parts[4]}


def cron_matches(expr: str, dt: datetime) -> bool:
    parsed = parse_cron(expr)
    if not parsed:
        return False

    def match_field(field_val: str, time_val: int) -> bool:
        if field_val == "*":
            return True
        for part in field_val.split(","):
            if "/" in part:
                base, step = part.split("/", 1)
                step = int(step)
                start = 0 if base == "*" else int(base)
                if (time_val - start) % step == 0 and time_val >= start:
                    return True
            elif "-" in part:
                lo, hi = part.split("-", 1)
                if int(lo) <= time_val <= int(hi):
                    return True
            else:
                if int(part) == time_val:
                    return True
        return False

    return (
        match_field(parsed["minute"], dt.minute)
        and match_field(parsed["hour"], dt.hour)
        and match_field(parsed["day"], dt.day)
        and match_field(parsed["month"], dt.month)
        and match_field(parsed["weekday"], dt.weekday())
    )


def cron_next_run(expr: str, after: datetime = None) -> str | None:
    if not after:
        after = datetime.now(timezone.utc)
    candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(7 * 24 * 60):
        if cron_matches(expr, candidate):
            return candidate.isoformat()
        candidate += timedelta(minutes=1)
    return None


# ---------------------------------------------------------------------------
# Task log helpers (for the existing task_logs UI)
# ---------------------------------------------------------------------------
def log_task_start(conn, page_id, org_id, config_version=0) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO task_logs (page_id, org_id, status, config_version) VALUES (%s, %s, 'running', %s) RETURNING id",
            [page_id, org_id, config_version],
        )
        log_id = cur.fetchone()[0]
    conn.commit()
    return log_id


def log_task_end(conn, log_id, success, message, duration_ms, error=None):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE task_logs SET status = %s, message = %s, duration_ms = %s, error = %s WHERE id = %s",
            [
                "success" if success else "error",
                (message or "")[:2000] or None,
                duration_ms,
                (error or "")[:2000] or None,
                log_id,
            ],
        )
    conn.commit()


def update_schedule_metadata(conn, page_id, config, success, message=""):
    """Update only the schedule key in page config via JSONB merge."""
    now_iso = datetime.now(timezone.utc).isoformat()
    schedule = config.get("schedule", {})
    run_count = schedule.get("run_count", 0) + 1
    cron_expr = schedule.get("cron", "")
    schedule_update = {
        "last_run": now_iso,
        "last_status": "success" if success else "error",
        "run_count": run_count,
        "cron": cron_expr,
        "enabled": schedule.get("enabled", True),
        "next_run": cron_next_run(cron_expr) if cron_expr else None,
    }
    if message:
        schedule_update["last_message"] = message[:500]
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE user_pages SET config = jsonb_set(config, '{schedule}', %s::jsonb), updated_at = NOW() WHERE id = %s",
            [json.dumps(schedule_update), page_id],
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Enqueue — cron ticker writes jobs here
# ---------------------------------------------------------------------------
def enqueue_job(conn, page_id, org_id, job_type, timeout_s, config, task_snapshot):
    """Insert a job into the queue. Skips if a pending/running job already exists for this page."""
    with conn.cursor() as cur:
        # Prevent duplicate jobs for the same page
        cur.execute(
            "SELECT 1 FROM job_queue WHERE page_id = %s AND status IN ('pending', 'running') LIMIT 1",
            [page_id],
        )
        if cur.fetchone():
            return None  # already queued/running
        # Per-org concurrency check
        cur.execute(
            "SELECT COUNT(*) FROM job_queue WHERE org_id = %s AND status IN ('pending', 'running')",
            [org_id],
        )
        count = cur.fetchone()[0]
        if count >= MAX_JOBS_PER_ORG:
            logger.warning(f"Org {org_id[:8]} has {count} pending/running jobs — skipping new enqueue")
            return None
        cur.execute(
            """INSERT INTO job_queue (page_id, org_id, job_type, timeout_s, config, task_snapshot)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            [page_id, org_id, job_type, timeout_s, json.dumps(config), json.dumps(task_snapshot)],
        )
        job_id = cur.fetchone()[0]
    conn.commit()
    return job_id


# ---------------------------------------------------------------------------
# Claim — workers call this to atomically grab one job
# ---------------------------------------------------------------------------
def claim_job(conn) -> dict | None:
    """Atomically claim the next pending job. Returns job dict or None."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            UPDATE job_queue
            SET status = 'running', claimed_at = NOW()
            WHERE id = (
                SELECT id FROM job_queue
                WHERE status = 'pending'
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING *
        """)
        row = cur.fetchone()
    conn.commit()
    if row:
        # Deserialize JSONB fields
        for field in ("config", "task_snapshot"):
            if isinstance(row[field], str):
                row[field] = json.loads(row[field])
    return row


def finish_job(conn, job_id, success, message="", error=None, duration_ms=0):
    """Mark job as done."""
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE job_queue
               SET status = %s, finished_at = NOW(), result_message = %s,
                   error = %s, duration_ms = %s
               WHERE id = %s""",
            [
                "success" if success else "error",
                (message or "")[:2000] or None,
                (error or "")[:2000] or None,
                duration_ms,
                job_id,
            ],
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Reaper — find jobs stuck in 'running' past their timeout
# ---------------------------------------------------------------------------
def reap_stuck_jobs(conn):
    """Mark timed-out jobs as failed. Called periodically."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE job_queue
            SET status = 'error', finished_at = NOW(),
                error = 'Reaped: job exceeded timeout (worker may have crashed)'
            WHERE status = 'running'
              AND claimed_at < NOW() - INTERVAL '1 second' * timeout_s
            RETURNING id, page_id
        """)
        reaped = cur.fetchall()
    conn.commit()
    for job_id, page_id in reaped:
        logger.warning(f"Reaped stuck job {job_id} (page {page_id})")
    return len(reaped)


def cleanup_old_jobs(conn, keep_days=7):
    """Delete completed jobs older than keep_days."""
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM job_queue WHERE status IN ('success', 'error') AND created_at < NOW() - INTERVAL '%s days'",
            [keep_days],
        )
        deleted = cur.rowcount
    conn.commit()
    if deleted > 0:
        logger.info(f"Cleaned up {deleted} old jobs")


# Log retention policy:
#   - Keep last MAX_LOGS_PER_PAGE logs per page (rolling window)
#   - Delete all logs older than LOGS_RETENTION_DAYS
#   - Runs every cron tick alongside job cleanup
MAX_LOGS_PER_PAGE = int(os.environ.get("SCHEDULER_MAX_LOGS_PER_PAGE", "50"))
LOGS_RETENTION_DAYS = int(os.environ.get("SCHEDULER_LOGS_RETENTION_DAYS", "30"))


def cleanup_task_logs(conn):
    """Enforce log retention: per-page cap + age limit."""
    with conn.cursor() as cur:
        # 1. Delete logs older than retention period
        cur.execute(
            "DELETE FROM task_logs WHERE created_at < NOW() - INTERVAL '%s days'",
            [LOGS_RETENTION_DAYS],
        )
        aged = cur.rowcount

        # 2. Per-page cap: keep only the most recent MAX_LOGS_PER_PAGE per page
        cur.execute("""
            DELETE FROM task_logs WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY created_at DESC) as rn
                    FROM task_logs
                ) ranked WHERE rn > %s
            )
        """, [MAX_LOGS_PER_PAGE])
        capped = cur.rowcount
    conn.commit()
    total = aged + capped
    if total > 0:
        logger.info(f"Task log cleanup: {aged} aged out, {capped} over per-page cap ({MAX_LOGS_PER_PAGE})")


# ---------------------------------------------------------------------------
# Block / flow execution (unchanged logic, extracted for clarity)
# ---------------------------------------------------------------------------
def topological_sort(nodes: list, edges: list) -> list:
    in_deg = {n["id"]: 0 for n in nodes}
    adj = {n["id"]: [] for n in nodes}
    for e in edges:
        if e.get("from") in adj:
            adj[e["from"]].append(e["to"])
        if e.get("to") in in_deg:
            in_deg[e["to"]] += 1
    queue = [nid for nid, deg in in_deg.items() if deg == 0]
    order = []
    while queue:
        cur = queue.pop(0)
        order.append(cur)
        for nxt in adj.get(cur, []):
            in_deg[nxt] -= 1
            if in_deg[nxt] == 0:
                queue.append(nxt)
    node_map = {n["id"]: n for n in nodes}
    return [{"type": node_map[nid]["type"], "config": node_map[nid].get("config", {})} for nid in order if nid in node_map]


def real_table_name(org_id: str, table_name: str) -> str:
    short = org_id.replace("-", "")[:8]
    return f"org_{short}_{table_name}"


def execute_flow_blocks(conn, org_id: str, blocks: list, user_id=None) -> tuple[bool, str]:
    """Execute visual flow blocks directly via SQL."""
    data = []
    messages = []

    for block in blocks:
        btype = block.get("type")
        config = block.get("config", {})

        if btype == "data_source":
            table_name = config.get("table")
            if not table_name:
                messages.append("data_source: no table")
                continue
            rname = real_table_name(org_id, table_name)
            limit = min(int(config.get("limit", 100)), 1000)
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f'SELECT * FROM "{rname}" WHERE org_id = %s ORDER BY created_at DESC LIMIT %s', [org_id, limit])
                data = cur.fetchall()
            messages.append(f"data_source: {len(data)} rows from {table_name}")

        elif btype == "filter":
            col, op, val = config.get("column"), config.get("operator", "="), config.get("value", "")
            if not col:
                continue
            before = len(data)
            filtered = []
            for row in data:
                rv = row.get(col)
                try:
                    if op == "=" and str(rv) == str(val): filtered.append(row)
                    elif op == "!=" and str(rv) != str(val): filtered.append(row)
                    elif op == ">" and float(rv or 0) > float(val): filtered.append(row)
                    elif op == "<" and float(rv or 0) < float(val): filtered.append(row)
                    elif op == ">=" and float(rv or 0) >= float(val): filtered.append(row)
                    elif op == "<=" and float(rv or 0) <= float(val): filtered.append(row)
                    elif op == "contains" and str(val) in str(rv or ""): filtered.append(row)
                    elif op == "is not null" and rv is not None: filtered.append(row)
                except (ValueError, TypeError):
                    pass
            data = filtered
            messages.append(f"filter: {before} -> {len(data)} ({col} {op} {val})")

        elif btype == "aggregate":
            agg, col = config.get("aggregation", "count"), config.get("column")
            vals = [float(r.get(col, 0) or 0) for r in data] if col else []
            result = 0
            if agg == "count": result = len(data)
            elif agg == "sum" and vals: result = sum(vals)
            elif agg == "avg" and vals: result = sum(vals) / len(vals)
            elif agg == "min" and vals: result = min(vals)
            elif agg == "max" and vals: result = max(vals)
            messages.append(f"aggregate: {agg}({col or '*'}) = {round(result, 2)}")

        elif btype == "add_column":
            # Add a computed column to each row in the data flow
            new_col = config.get("new_column", "").strip()
            expression = config.get("expression", "").strip()
            if not new_col or not expression:
                messages.append("add_column: missing column name or expression")
                continue
            added = 0
            for row in data:
                try:
                    # Safe eval: only allow column references, math ops, and builtins
                    safe_ns = {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in row.items()}
                    safe_ns.update({"__builtins__": {"abs": abs, "round": round, "min": min, "max": max, "len": len, "str": str, "float": float, "int": int}})
                    row[new_col] = eval(expression, safe_ns)
                    added += 1
                except Exception:
                    row[new_col] = None
            messages.append(f"add_column: {new_col} = {expression} ({added} rows)")

        elif btype == "rename_column":
            # Rename a column in the data flow
            old_name = config.get("old_name", "").strip()
            new_name = config.get("new_name", "").strip()
            if not old_name or not new_name:
                messages.append("rename_column: missing old or new name")
                continue
            for row in data:
                if old_name in row:
                    row[new_name] = row.pop(old_name)
            messages.append(f"rename_column: {old_name} -> {new_name}")

        elif btype == "drop_column":
            # Remove columns from the data flow
            columns = [c.strip() for c in config.get("columns", "").split(",") if c.strip()]
            if not columns:
                messages.append("drop_column: no columns specified")
                continue
            for row in data:
                for col in columns:
                    row.pop(col, None)
            messages.append(f"drop_column: removed {', '.join(columns)}")

        elif btype == "alter_table":
            # Modify a real DB table schema: add/remove columns
            table_name = config.get("table")
            action = config.get("action", "add")  # add or drop
            col_name = config.get("column_name", "").strip()
            col_type = config.get("column_type", "text")
            if not table_name or not col_name:
                messages.append("alter_table: missing table or column name")
                continue
            rname = real_table_name(org_id, table_name)
            try:
                if action == "add":
                    # Map user types to Postgres types
                    type_map = {"text": "TEXT", "float": "DOUBLE PRECISION", "int": "INTEGER", "boolean": "BOOLEAN", "timestamp": "TIMESTAMPTZ", "json": "JSONB"}
                    pg_type = type_map.get(col_type, "TEXT")
                    with conn.cursor() as cur:
                        cur.execute(f'ALTER TABLE "{rname}" ADD COLUMN IF NOT EXISTS "{col_name}" {pg_type}')
                    # Also update the org_tables metadata
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT id, columns FROM org_tables WHERE org_id = %s AND name = %s", [org_id, table_name])
                        tbl = cur.fetchone()
                    if tbl:
                        cols = tbl["columns"] if isinstance(tbl["columns"], list) else json.loads(tbl["columns"])
                        if not any(c["name"] == col_name for c in cols):
                            cols.append({"name": col_name, "type": col_type})
                            with conn.cursor() as cur:
                                cur.execute("UPDATE org_tables SET columns = %s WHERE id = %s", [json.dumps(cols), tbl["id"]])
                    conn.commit()
                    messages.append(f"alter_table: added {col_name} ({pg_type}) to {table_name}")
                elif action == "drop":
                    with conn.cursor() as cur:
                        cur.execute(f'ALTER TABLE "{rname}" DROP COLUMN IF EXISTS "{col_name}"')
                    # Update metadata
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute("SELECT id, columns FROM org_tables WHERE org_id = %s AND name = %s", [org_id, table_name])
                        tbl = cur.fetchone()
                    if tbl:
                        cols = tbl["columns"] if isinstance(tbl["columns"], list) else json.loads(tbl["columns"])
                        cols = [c for c in cols if c["name"] != col_name]
                        with conn.cursor() as cur:
                            cur.execute("UPDATE org_tables SET columns = %s WHERE id = %s", [json.dumps(cols), tbl["id"]])
                    conn.commit()
                    messages.append(f"alter_table: dropped {col_name} from {table_name}")
            except Exception as e:
                messages.append(f"alter_table: error — {e}")

        elif btype == "insert":
            table_name = config.get("table")
            if not table_name or not data:
                messages.append("insert: no table or no data")
                continue
            rname = real_table_name(org_id, table_name)
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT columns FROM org_tables WHERE org_id = %s AND name = %s", [org_id, table_name])
                tbl = cur.fetchone()
            if not tbl:
                messages.append(f"insert: table {table_name} not found")
                continue
            cols_def = tbl["columns"] if isinstance(tbl["columns"], list) else json.loads(tbl["columns"])
            col_names = [c["name"] for c in cols_def]
            inserted = 0
            for row in data:
                vals = {cn: row[cn] for cn in col_names if cn in row}
                if not vals:
                    continue
                cols_sql = ", ".join(f'"{k}"' for k in vals.keys())
                placeholders = ", ".join(["%s"] * len(vals))
                with conn.cursor() as cur:
                    cur.execute(f'INSERT INTO "{rname}" (org_id, {cols_sql}) VALUES (%s, {placeholders})', [org_id, *vals.values()])
                inserted += 1
            conn.commit()
            messages.append(f"insert: {inserted} rows into {table_name}")

        elif btype == "generate":
            import random
            count = int(config.get("count", 1))
            fields = config.get("fields", {})
            generated = []
            for _ in range(count):
                row = {}
                for fname, fspec in fields.items():
                    if isinstance(fspec, dict):
                        ftype = fspec.get("type", "float")
                        if ftype == "float": row[fname] = round(random.uniform(fspec.get("min", 0), fspec.get("max", 100)), 1)
                        elif ftype == "int": row[fname] = random.randint(int(fspec.get("min", 0)), int(fspec.get("max", 100)))
                        elif ftype == "choice": row[fname] = random.choice(fspec.get("options", ["unknown"]))
                    else:
                        row[fname] = fspec
                generated.append(row)
            data = generated
            messages.append(f"generate: {len(data)} rows")

        elif btype == "notify":
            title = config.get("title", "")
            if title and user_id:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO notifications (org_id, user_id, title, message, type, source) VALUES (%s, %s, %s, %s, %s, 'scheduler')",
                        [org_id, user_id, title, config.get("message", ""), config.get("type", "info")],
                    )
                conn.commit()
                messages.append(f"notify: {title}")

        elif btype == "output":
            messages.append(f"output: {len(data)} rows")

        elif btype in ("anomaly_detection", "statistics", "moving_average", "fft", "custom_code"):
            from ml_blocks import anomaly_detection, statistics, moving_average, fft_analysis, run_custom_code
            fn_map = {"anomaly_detection": anomaly_detection, "statistics": statistics,
                      "moving_average": moving_average, "fft": fft_analysis, "custom_code": run_custom_code}
            data, msg = fn_map[btype](data, config)
            messages.append(msg)

        elif btype == "ws_publish":
            import channels as ch_mod
            channel = config.get("channel")
            if channel and data:
                for row in data[:100]:
                    asyncio.get_event_loop().call_soon(
                        lambda r=row: asyncio.ensure_future(ch_mod.publish(org_id, channel, r))
                    )
                messages.append(f"ws_publish: {min(len(data), 100)} messages to {channel}")

    return True, " | ".join(messages) if messages else "No blocks executed"


# ---------------------------------------------------------------------------
# Executors — one per job type
# ---------------------------------------------------------------------------
async def execute_notebook(task: dict, timeout_s: int) -> tuple[bool, str]:
    """Execute a notebook via docker exec + nbconvert."""
    config = task["config"]
    org_short = task["org_id"].replace("-", "")[:8]
    user_id = task.get("user_id", 0)
    nb_name = f"u{user_id}_{task['slug'] or task['page_name'].lower().replace(' ', '-')}.ipynb"
    user_api = f"{JUPYTER_URL}/jupyter/user/{org_short}"
    hub_api = f"{JUPYTER_URL}/jupyter/hub/api"
    hub_token = os.getenv("JUPYTERHUB_API_TOKEN", "")
    hub_headers = {"Authorization": f"token {hub_token}"} if hub_token else {}

    # 1. Ensure JupyterHub user exists with correct auth_state (org plan + limits)
    org_id = task["org_id"]
    auth_state_payload = json.dumps({"org_id": org_id, "org_name": task.get("org_name", ""), "plan": "enterprise"})

    # Read actual plan from DB
    try:
        _conn = get_db()
        with _conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as _cur:
            _cur.execute("SELECT plan FROM organizations WHERE id = %s", [org_id])
            _org = _cur.fetchone()
            if _org:
                auth_state_payload = json.dumps({"org_id": org_id, "org_name": task.get("org_name", ""), "plan": _org["plan"]})
        _conn.close()
    except Exception:
        pass

    try:
        req = urllib.request.Request(f"{hub_api}/users/{org_short}", headers=hub_headers)
        urllib.request.urlopen(req, timeout=10)
        # Update auth_state for existing user
        req = urllib.request.Request(
            f"{hub_api}/users/{org_short}", method="PATCH",
            headers={**hub_headers, "Content-Type": "application/json"},
            data=json.dumps({"auth_state": json.loads(auth_state_payload)}).encode(),
        )
        urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            req = urllib.request.Request(
                f"{hub_api}/users/{org_short}", method="POST",
                headers={**hub_headers, "Content-Type": "application/json"},
                data=json.dumps({"auth_state": json.loads(auth_state_payload)}).encode(),
            )
            urllib.request.urlopen(req, timeout=10)

    # 2. Ensure Jupyter server is running with correct resource limits
    # Check if existing container has wrong memory limit — if so, delete and respawn
    try:
        container_name = f"jupyter-{org_short}"
        inspect_result = subprocess.run(
            ["docker", "inspect", "--format", "{{.HostConfig.Memory}}", container_name],
            capture_output=True, text=True, timeout=10,
        )
        if inspect_result.returncode == 0:
            current_mem = int(inspect_result.stdout.strip() or 0)
            # enterprise = 2G = 2147483648, if container has < 512MB it's probably stale
            if 0 < current_mem < 512 * 1024 * 1024:
                logger.info(f"Container {container_name} has {current_mem // (1024*1024)}MB — respawning with correct limits")
                try:
                    req = urllib.request.Request(
                        f"{hub_api}/users/{org_short}/server", method="DELETE",
                        headers=hub_headers,
                    )
                    urllib.request.urlopen(req, timeout=30)
                    await asyncio.sleep(5)  # wait for container to stop
                except Exception:
                    pass
    except Exception:
        pass

    try:
        req = urllib.request.Request(
            f"{hub_api}/users/{org_short}/server", method="POST",
            headers={**hub_headers, "Content-Type": "application/json"}, data=b"{}",
        )
        urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        if e.code not in (400, 201):
            return False, f"Could not start Jupyter server: {e.code}"

    # Wait for server ready
    for _ in range(30):
        try:
            urllib.request.urlopen(urllib.request.Request(f"{user_api}/api/status"), timeout=5)
            break
        except Exception:
            await asyncio.sleep(1)

    # 3. Check for active kernel — skip if user is editing
    try:
        res = urllib.request.urlopen(urllib.request.Request(f"{user_api}/api/kernels"), timeout=5)
        for k in json.loads(res.read()):
            kpath = k.get("path", "")
            if kpath == nb_name or kpath.endswith(f"/{nb_name}"):
                return False, f"Skipped: user has active kernel for {nb_name}"
    except Exception:
        pass

    # 4. Refresh SDK token and push notebook
    nb_content = config.get("notebook_content")
    fresh_token = None
    if nb_content and nb_content.get("cells"):
        import jose_helper
        fresh_token = jose_helper.create_notebook_token(user_id=user_id, org_id=task["org_id"])
        for cell in nb_content.get("cells", []):
            if cell.get("cell_type") != "code":
                continue
            src = "".join(cell.get("source", [])) if isinstance(cell.get("source"), list) else (cell.get("source") or "")
            if "CUESTACK_TOKEN" in src:
                cell["source"] = re.sub(
                    r'os\.environ\["CUESTACK_TOKEN"\]\s*=\s*"[^"]*"',
                    f'os.environ["CUESTACK_TOKEN"] = "{fresh_token}"',
                    src,
                )
                break

    if nb_content:
        # Clear outputs, ensure source is list
        for cell in nb_content.get("cells", []):
            if cell.get("cell_type") == "code":
                cell["outputs"] = []
                cell["execution_count"] = None
            src = cell.get("source", "")
            if isinstance(src, str):
                cell["source"] = src.splitlines(True) if src else []

        # Check if file already exists on disk
        try:
            urllib.request.urlopen(urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=0"), timeout=10)
            file_exists = True
        except Exception:
            file_exists = False

        if file_exists and fresh_token:
            # Update token in existing disk file
            try:
                res = urllib.request.urlopen(urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=1"), timeout=15)
                disk_nb = json.loads(res.read()).get("content", {})
                for cell in disk_nb.get("cells", []):
                    if cell.get("cell_type") != "code":
                        continue
                    src = "".join(cell.get("source", []))
                    if "CUESTACK_TOKEN" in src:
                        updated = re.sub(r'os\.environ\["CUESTACK_TOKEN"\]\s*=\s*"[^"]*"', f'os.environ["CUESTACK_TOKEN"] = "{fresh_token}"', src)
                        updated = re.sub(r'os\.environ\["CUESTACK_URL"\]\s*=\s*"[^"]*"', 'os.environ["CUESTACK_URL"] = "http://nginx:80"', updated)
                        cell["source"] = updated.splitlines(True)
                        break
                for cell in disk_nb.get("cells", []):
                    if cell.get("cell_type") == "code":
                        cell["outputs"] = []
                        cell["execution_count"] = None
                body = json.dumps({"type": "notebook", "content": disk_nb}).encode()
                urllib.request.urlopen(
                    urllib.request.Request(f"{user_api}/api/contents/{nb_name}", method="PUT",
                                          headers={"Content-Type": "application/json"}, data=body), timeout=30)
            except Exception as e:
                logger.warning(f"Token update failed, proceeding anyway: {e}")
        else:
            body = json.dumps({"type": "notebook", "content": nb_content}).encode()
            req = urllib.request.Request(f"{user_api}/api/contents/{nb_name}", method="PUT",
                                        headers={"Content-Type": "application/json"}, data=body)
            try:
                urllib.request.urlopen(req, timeout=30)
            except Exception as e:
                return False, f"Failed to push notebook: {e}"

    # 5. Execute via docker exec + nbconvert
    container_name = f"jupyter-{org_short}"
    nb_path = f"/workspace/{nb_name}"

    def run_nbconvert():
        return subprocess.run(
            ["docker", "exec", "-u", "jupyter", container_name,
             "jupyter", "nbconvert", "--to", "notebook", "--execute",
             "--no-input",
             f"--ExecutePreprocessor.timeout={timeout_s}",
             "--ExecutePreprocessor.startup_timeout=60",
             "--ExecutePreprocessor.kernel_name=python3",
             "--allow-errors",
             "--output", nb_name, nb_path],
            capture_output=True, text=True,
            timeout=timeout_s + 60,  # subprocess timeout > cell timeout
        )

    result = await asyncio.get_event_loop().run_in_executor(_subprocess_pool, run_nbconvert)

    if result.returncode != 0:
        logger.error(f"nbconvert stderr: {result.stderr[:2000] if result.stderr else 'none'}")
        error_msg = (result.stderr or result.stdout or "Unknown error")[:1000]
        return False, f"nbconvert failed (exit={result.returncode}): {error_msg}"

    # 6. Pull executed notebook back to DB
    try:
        res = urllib.request.urlopen(urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=1"), timeout=30)
        executed_nb = json.loads(res.read()).get("content")
    except Exception as e:
        return False, f"Failed to pull executed notebook: {e}"

    if executed_nb:
        conn = get_db()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT config FROM user_pages WHERE id = %s", [task["page_id"]])
                row = cur.fetchone()
            if row:
                existing_cfg = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"] or "{}")
                existing_cfg["notebook_content"] = executed_nb
                with conn.cursor() as cur:
                    cur.execute("UPDATE user_pages SET config = %s, updated_at = NOW() WHERE id = %s",
                                [json.dumps(existing_cfg), task["page_id"]])
                conn.commit()
        finally:
            conn.close()

        code_cells = [c for c in executed_nb.get("cells", []) if c.get("cell_type") == "code"]
        return True, f"Notebook executed: {len(code_cells)} cells, outputs saved to DB"

    return True, "Notebook executed but no content returned"


async def execute_job(job: dict) -> tuple[bool, str]:
    """Route a job to the appropriate executor."""
    task = job["task_snapshot"]
    job_type = job["job_type"]
    timeout_s = job["timeout_s"]

    try:
        if job_type == "notebook":
            return await asyncio.wait_for(execute_notebook(task, timeout_s), timeout=timeout_s + 120)

        elif job_type == "visual":
            config = task["config"]
            nodes = config.get("nodes", [])
            edges = config.get("edges", [])
            blocks = topological_sort(nodes, edges) if nodes else config.get("blocks", [])
            if not blocks:
                return False, "No blocks configured"
            conn = get_db()
            try:
                return execute_flow_blocks(conn, task["org_id"], blocks, user_id=task.get("user_id"))
            finally:
                conn.close()

        else:
            return True, f"Job type {job_type} — no executor configured"

    except asyncio.TimeoutError:
        return False, f"Job timed out after {timeout_s}s"
    except subprocess.TimeoutExpired:
        return False, f"Subprocess timed out after {timeout_s}s"
    except FileNotFoundError:
        return False, "Docker CLI not available in backend container"
    except Exception as e:
        return False, f"Execution error: {e}"


# ---------------------------------------------------------------------------
# Worker — claims and executes one job at a time
# ---------------------------------------------------------------------------
async def worker(worker_id: int, stop_event: asyncio.Event):
    """Worker loop: claim a job, execute it, repeat."""
    logger.info(f"Worker-{worker_id} started")
    while not stop_event.is_set():
        conn = get_db()
        try:
            job = claim_job(conn)
        finally:
            conn.close()

        if not job:
            await asyncio.sleep(2)  # no work — back off
            continue

        page_id = str(job["page_id"])
        org_id = str(job["org_id"])
        task = job["task_snapshot"]
        config_ver = task.get("config", {}).get("_version", 0)

        logger.info(f"Worker-{worker_id} claimed job {job['id']}: {task.get('page_name', '?')} ({job['job_type']})")
        start_ms = int(time.time() * 1000)

        # Log to task_logs for UI
        log_conn = get_db()
        try:
            log_id = log_task_start(log_conn, page_id, org_id, config_ver)
        finally:
            log_conn.close()

        try:
            success, message = await execute_job(job)
        except Exception as e:
            success, message = False, str(e)
            logger.error(f"Worker-{worker_id} job {job['id']} error: {traceback.format_exc()}")

        duration_ms = int(time.time() * 1000) - start_ms
        error_detail = None if success else message

        # Update job_queue
        conn = get_db()
        try:
            finish_job(conn, job["id"], success, message, error_detail, duration_ms)
        finally:
            conn.close()

        # Update task_logs
        log_conn = get_db()
        try:
            log_task_end(log_conn, log_id, success, message, duration_ms, error_detail)
        finally:
            log_conn.close()

        # Update page schedule metadata
        meta_conn = get_db()
        try:
            update_schedule_metadata(meta_conn, page_id, task.get("config", {}), success, message)
        finally:
            meta_conn.close()

        # Broadcast page update event via WebSocket so open pages auto-refresh
        try:
            from channels import publish as ws_publish, _subscribers, _channel_key
            ch_name = f"_page:{page_id}"
            key = _channel_key(org_id, ch_name)
            n_subs = len(_subscribers.get(key, set()))
            await ws_publish(org_id, ch_name, {
                "event": "execution_complete",
                "page_id": page_id,
                "status": "success" if success else "error",
                "message": message,
                "duration_ms": duration_ms,
            })
            logger.info(f"WS broadcast _page:{page_id[:8]} ({n_subs} subscribers)")
        except Exception as e:
            logger.warning(f"WS broadcast failed: {e}")

        logger.info(f"Worker-{worker_id} job {job['id']} {'OK' if success else 'FAIL'} ({duration_ms}ms)")


# ---------------------------------------------------------------------------
# Cron ticker — evaluates schedules, enqueues due jobs
# ---------------------------------------------------------------------------
async def cron_ticker(stop_event: asyncio.Event):
    """Periodically check cron expressions and enqueue due jobs."""
    logger.info(f"Cron ticker started (poll every {POLL_INTERVAL}s)")
    while not stop_event.is_set():
        try:
            conn = get_db()
            try:
                now = datetime.now(timezone.utc)

                # Fetch all pages with schedules + org feature limits
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT p.id, p.name, p.slug, p.page_type, p.config, p.org_id, p.user_id,
                               u.username as owner_name
                        FROM user_pages p LEFT JOIN users u ON p.user_id = u.id
                        WHERE p.entry_type = 'page' AND p.config::text LIKE '%schedule%'
                    """)
                    rows = cur.fetchall()

                # Load per-org schedule limits from org_features
                org_schedule_limits = {}  # org_id -> max_schedules
                org_schedule_counts = {}  # org_id -> current count of enabled schedules
                for row in rows:
                    oid = str(row["org_id"])
                    config = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"] or "{}")
                    schedule = config.get("schedule", {})
                    if schedule.get("cron") and schedule.get("enabled") is not False:
                        org_schedule_counts[oid] = org_schedule_counts.get(oid, 0) + 1

                if org_schedule_counts:
                    org_ids = list(org_schedule_counts.keys())
                    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                        cur.execute(
                            "SELECT org_id, config FROM org_features WHERE feature = 'notebooks' AND enabled = true AND org_id = ANY(%s::uuid[])",
                            [org_ids],
                        )
                        for feat_row in cur.fetchall():
                            feat_cfg = feat_row["config"] if isinstance(feat_row["config"], dict) else json.loads(feat_row["config"] or "{}")
                            org_schedule_limits[str(feat_row["org_id"])] = int(feat_cfg.get("max_schedules", 100))

                enqueued = 0
                for row in rows:
                    config = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"] or "{}")
                    schedule = config.get("schedule", {})
                    cron_expr = schedule.get("cron")
                    if not cron_expr or schedule.get("enabled") is False:
                        continue
                    if not cron_matches(cron_expr, now):
                        continue

                    # Skip if already ran this minute
                    last_run = schedule.get("last_run")
                    if last_run:
                        try:
                            last_dt = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
                            if (now - last_dt).total_seconds() < 55:
                                continue
                        except (ValueError, TypeError):
                            pass

                    # Check org schedule limit
                    oid = str(row["org_id"])
                    max_sched = org_schedule_limits.get(oid, 100)
                    if org_schedule_counts.get(oid, 0) > max_sched:
                        logger.warning(f"Org {oid[:8]} has {org_schedule_counts[oid]} schedules but limit is {max_sched} — skipping")
                        continue

                    timeout_s = int(schedule.get("timeout", DEFAULT_TIMEOUT))
                    task_snapshot = {
                        "page_id": str(row["id"]),
                        "page_name": row["name"],
                        "page_type": row["page_type"],
                        "slug": row["slug"],
                        "org_id": str(row["org_id"]),
                        "user_id": row["user_id"],
                        "owner": row["owner_name"],
                        "cron": cron_expr,
                        "config": config,
                    }

                    job_id = enqueue_job(conn, str(row["id"]), str(row["org_id"]),
                                         row["page_type"], timeout_s, config, task_snapshot)
                    if job_id:
                        enqueued += 1

                if enqueued:
                    logger.info(f"Enqueued {enqueued} job(s)")

                # Reap stuck jobs and clean old ones
                reap_stuck_jobs(conn)
                cleanup_old_jobs(conn)
                cleanup_task_logs(conn)

            finally:
                conn.close()

        except Exception as e:
            logger.error(f"Cron ticker error: {e}")

        await asyncio.sleep(POLL_INTERVAL)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
async def run_scheduler():
    """Start cron ticker + worker pool."""
    logger.info(f"Scheduler starting: {NUM_WORKERS} workers, poll every {POLL_INTERVAL}s, "
                f"job timeout {DEFAULT_TIMEOUT}s, max {MAX_JOBS_PER_ORG} jobs/org")

    # Ensure schema
    conn = get_db()
    try:
        ensure_schema(conn)
        logger.info("Schema ready (job_queue + task_logs)")
    except Exception as e:
        logger.error(f"Schema setup failed: {e}")
    finally:
        conn.close()

    stop_event = asyncio.Event()

    # Launch workers + ticker
    tasks = [
        asyncio.create_task(cron_ticker(stop_event)),
    ]
    for i in range(NUM_WORKERS):
        tasks.append(asyncio.create_task(worker(i, stop_event)))

    # Run forever (until cancelled)
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        stop_event.set()
        logger.info("Scheduler shutting down")
