"""
Cron scheduler — polls user_pages for scheduled tasks, executes them.

Runs as a background asyncio task inside the FastAPI process.
Uses PostgreSQL advisory locks for distributed safety (multiple replicas).
Stores execution logs in task_logs table for auditing.
"""

import asyncio
import json
import logging
import os
import traceback
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [scheduler] %(message)s"))
logger.addHandler(handler)

DATABASE_URL = os.getenv("DATABASE_URL", "")
JUPYTER_URL = os.getenv("JUPYTER_URL", "http://jupyterhub:8000")
POLL_INTERVAL = int(os.getenv("SCHEDULER_POLL_INTERVAL", "60"))

# Advisory lock ID for the scheduler (prevents duplicate execution across replicas)
SCHEDULER_LOCK_ID = 999001


def get_db():
    return psycopg2.connect(DATABASE_URL)


def ensure_task_logs_table(conn):
    """Create task_logs table if not exists."""
    with conn.cursor() as cur:
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
        # Add config_version if table already exists without it
        cur.execute("ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS config_version INTEGER DEFAULT 0")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_logs_page ON task_logs (page_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_logs_org ON task_logs (org_id, created_at DESC)")
    conn.commit()


def try_advisory_lock(conn) -> bool:
    """Try to acquire a PostgreSQL advisory lock. Returns True if acquired."""
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", [SCHEDULER_LOCK_ID])
        return cur.fetchone()[0]


def release_advisory_lock(conn):
    """Release the advisory lock."""
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", [SCHEDULER_LOCK_ID])
    except Exception:
        pass


def log_task_start(conn, page_id, org_id, config_version=0) -> int:
    """Log task execution start. Returns log ID."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO task_logs (page_id, org_id, status, config_version) VALUES (%s, %s, 'running', %s) RETURNING id",
            [page_id, org_id, config_version]
        )
        log_id = cur.fetchone()[0]
    conn.commit()
    return log_id


def log_task_end(conn, log_id, success, message, duration_ms, error=None):
    """Update task log with result."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE task_logs SET status = %s, message = %s, duration_ms = %s, error = %s WHERE id = %s",
            ["success" if success else "error", message[:2000] if message else None, duration_ms, error[:2000] if error else None, log_id]
        )
    conn.commit()


def parse_cron(expr: str) -> dict:
    """Parse a cron expression into component parts."""
    parts = expr.strip().split()
    if len(parts) != 5:
        return None
    return {
        "minute": parts[0],
        "hour": parts[1],
        "day": parts[2],
        "month": parts[3],
        "weekday": parts[4],
    }


def cron_matches(expr: str, dt: datetime) -> bool:
    """Check if a cron expression matches a given datetime (minute precision)."""
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
        and match_field(parsed["weekday"], dt.weekday())  # 0=Mon
    )


def cron_next_run(expr: str, after: datetime = None) -> str | None:
    """Calculate next run time for a cron expression. Returns ISO string or None."""
    if not after:
        after = datetime.now(timezone.utc)
    # Start from next minute
    candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    # Check up to 7 days ahead
    for _ in range(7 * 24 * 60):
        if cron_matches(expr, candidate):
            return candidate.isoformat()
        candidate += timedelta(minutes=1)
    return None


def get_scheduled_tasks(conn) -> list:
    """Fetch all enabled scheduled tasks from user_pages."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.id, p.name, p.slug, p.page_type, p.config, p.org_id, p.user_id,
                   u.username as owner_name
            FROM user_pages p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.entry_type = 'page'
              AND p.config::text LIKE '%schedule%'
        """)
        rows = cur.fetchall()

    tasks = []
    for row in rows:
        config = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"] or "{}")
        schedule = config.get("schedule", {})
        if schedule.get("cron") and schedule.get("enabled", True) is not False:
            tasks.append({
                "page_id": str(row["id"]),
                "page_name": row["name"],
                "page_type": row["page_type"],
                "slug": row["slug"],
                "org_id": str(row["org_id"]),
                "user_id": row["user_id"],
                "owner": row["owner_name"],
                "cron": schedule["cron"],
                "last_run": schedule.get("last_run"),
                "config": config,
            })
    return tasks


def update_task_run(conn, page_id: str, config: dict, success: bool, message: str = ""):
    """Update only the schedule key in config — never overwrites other config (widgets, blocks, etc.).
    Uses JSONB merge so concurrent user edits to other config keys are safe."""
    now = datetime.now(timezone.utc).isoformat()
    run_count = config["schedule"].get("run_count", 0) + 1
    cron_expr = config["schedule"]["cron"]
    next_run = cron_next_run(cron_expr)
    schedule_update = {
        "last_run": now,
        "last_status": "success" if success else "error",
        "run_count": run_count,
        "cron": cron_expr,
        "enabled": config["schedule"].get("enabled", True),
        "next_run": next_run,
    }
    if message:
        schedule_update["last_message"] = message[:500]

    with conn.cursor() as cur:
        # jsonb_set merges only the schedule key — other config keys untouched
        cur.execute(
            "UPDATE user_pages SET config = jsonb_set(config, '{schedule}', %s::jsonb), updated_at = NOW() WHERE id = %s",
            [json.dumps(schedule_update), page_id],
        )
    conn.commit()


def topological_sort(nodes: list, edges: list) -> list:
    """Convert canvas graph to execution-ordered block list."""
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
    """Same logic as frontend org-tables.js — org-prefixed table name."""
    short = org_id.replace("-", "")[:8]
    return f"org_{short}_{table_name}"


def execute_flow_blocks(conn, org_id: str, blocks: list, user_id=None) -> tuple[bool, str]:
    """Execute visual flow blocks directly via SQL. Returns (success, message)."""
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
            real_name = real_table_name(org_id, table_name)
            limit = min(int(config.get("limit", 100)), 1000)
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f'SELECT * FROM "{real_name}" WHERE org_id = %s ORDER BY created_at DESC LIMIT %s', [org_id, limit])
                data = cur.fetchall()
            messages.append(f"data_source: {len(data)} rows from {table_name}")

        elif btype == "filter":
            col = config.get("column")
            op = config.get("operator", "=")
            val = config.get("value", "")
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
            messages.append(f"filter: {before} → {len(data)} ({col} {op} {val})")

        elif btype == "aggregate":
            agg = config.get("aggregation", "count")
            col = config.get("column")
            vals = [float(r.get(col, 0) or 0) for r in data] if col else []
            result = 0
            if agg == "count": result = len(data)
            elif agg == "sum" and vals: result = sum(vals)
            elif agg == "avg" and vals: result = sum(vals) / len(vals)
            elif agg == "min" and vals: result = min(vals)
            elif agg == "max" and vals: result = max(vals)
            messages.append(f"aggregate: {agg}({col or '*'}) = {round(result, 2)}")

        elif btype == "insert":
            # Insert generated data into a table
            table_name = config.get("table")
            if not table_name or not data:
                messages.append("insert: no table or no data")
                continue
            real_name = real_table_name(org_id, table_name)
            # Get table columns
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
                vals = {}
                for cn in col_names:
                    if cn in row:
                        vals[cn] = row[cn]
                if not vals:
                    continue
                cols_sql = ", ".join(f'"{k}"' for k in vals.keys())
                placeholders = ", ".join(["%s"] * len(vals))
                with conn.cursor() as cur:
                    cur.execute(
                        f'INSERT INTO "{real_name}" (org_id, {cols_sql}) VALUES (%s, {placeholders})',
                        [org_id, *vals.values()]
                    )
                inserted += 1
            conn.commit()
            messages.append(f"insert: {inserted} rows into {table_name}")

        elif btype == "generate":
            # Generate simulated data based on config
            import random
            count = int(config.get("count", 1))
            fields = config.get("fields", {})
            generated = []
            for _ in range(count):
                row = {}
                for fname, fspec in fields.items():
                    if isinstance(fspec, dict):
                        ftype = fspec.get("type", "float")
                        if ftype == "float":
                            row[fname] = round(random.uniform(fspec.get("min", 0), fspec.get("max", 100)), 1)
                        elif ftype == "int":
                            row[fname] = random.randint(int(fspec.get("min", 0)), int(fspec.get("max", 100)))
                        elif ftype == "choice":
                            row[fname] = random.choice(fspec.get("options", ["unknown"]))
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
                        [org_id, user_id, title, config.get("message", ""), config.get("type", "info")]
                    )
                conn.commit()
                messages.append(f"notify: {title}")

        elif btype == "output":
            messages.append(f"output: {len(data)} rows")

        elif btype == "anomaly_detection":
            from ml_blocks import anomaly_detection
            data, msg = anomaly_detection(data, config)
            messages.append(msg)

        elif btype == "statistics":
            from ml_blocks import statistics
            data, msg = statistics(data, config)
            messages.append(msg)

        elif btype == "moving_average":
            from ml_blocks import moving_average
            data, msg = moving_average(data, config)
            messages.append(msg)

        elif btype == "fft":
            from ml_blocks import fft_analysis
            data, msg = fft_analysis(data, config)
            messages.append(msg)

        elif btype == "custom_code":
            from ml_blocks import run_custom_code
            data, msg = run_custom_code(data, config)
            messages.append(msg)

        elif btype == "ws_publish":
            import channels as ch_mod
            channel = config.get("channel")
            if channel and data:
                import asyncio
                for row in data[:100]:
                    asyncio.get_event_loop().call_soon(
                        lambda r=row: asyncio.ensure_future(ch_mod.publish(org_id, channel, r))
                    )
                messages.append(f"ws_publish: {min(len(data),100)} messages to {channel}")

    return True, " | ".join(messages) if messages else "No blocks executed"


async def execute_task(conn, task: dict) -> tuple[bool, str]:
    """Execute a scheduled task based on page type."""
    page_type = task["page_type"]
    config = task["config"]

    if page_type == "visual":
        # Support both formats: canvas (nodes+edges) and legacy (blocks list)
        nodes = config.get("nodes", [])
        edges = config.get("edges", [])
        if nodes:
            # Canvas format — topological sort to get execution order
            blocks = topological_sort(nodes, edges)
        else:
            blocks = config.get("blocks", [])
        if not blocks:
            return False, "No blocks configured"
        return execute_flow_blocks(conn, task["org_id"], blocks, user_id=task.get("user_id"))

    elif page_type == "notebook":
        # Execute notebook via Jupyter nbconvert API, then pull output to DB
        import urllib.error
        import urllib.request
        org_short = task["org_id"].replace("-", "")[:8]
        user_id = task.get("user_id", 0)
        nb_name = f"u{user_id}_{task['slug'] or task['page_name'].lower().replace(' ', '-')}.ipynb"
        user_api = f"{JUPYTER_URL}/jupyter/user/{org_short}"
        hub_api = f"{JUPYTER_URL}/jupyter/hub/api"
        hub_token = os.getenv("JUPYTERHUB_API_TOKEN", "")
        hub_headers = {"Authorization": f"token {hub_token}"} if hub_token else {}

        # 1. Ensure user exists in JupyterHub
        try:
            req = urllib.request.Request(f"{hub_api}/users/{org_short}", headers=hub_headers)
            resp = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                req = urllib.request.Request(f"{hub_api}/users/{org_short}", method="POST",
                                            headers={**hub_headers, "Content-Type": "application/json"},
                                            data=b"{}")
                urllib.request.urlopen(req, timeout=10)

        # 2. Ensure server is running
        try:
            req = urllib.request.Request(f"{hub_api}/users/{org_short}/server", method="POST",
                                        headers={**hub_headers, "Content-Type": "application/json"},
                                        data=b"{}")
            urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as e:
            if e.code not in (400, 201):  # 400 = already running
                return False, f"Could not start Jupyter server: {e.code}"

        # Wait for server to be ready
        import time
        for _ in range(30):
            try:
                req = urllib.request.Request(f"{user_api}/api/status")
                urllib.request.urlopen(req, timeout=5)
                break
            except Exception:
                time.sleep(1)

        # 3. Refresh SDK token in notebook content before pushing
        nb_content = config.get("notebook_content")
        if nb_content and nb_content.get("cells"):
            import jose_helper
            fresh_token = jose_helper.create_notebook_token(
                user_id=task.get("user_id", 0),
                org_id=task["org_id"],
            )
            for cell in nb_content.get("cells", []):
                if cell.get("cell_type") != "code":
                    continue
                src = "".join(cell.get("source", [])) if isinstance(cell.get("source"), list) else (cell.get("source") or "")
                if "CUESTACK_TOKEN" in src:
                    import re
                    updated = re.sub(
                        r'os\.environ\["CUESTACK_TOKEN"\]\s*=\s*"[^"]*"',
                        f'os.environ["CUESTACK_TOKEN"] = "{fresh_token}"',
                        src,
                    )
                    cell["source"] = updated
                    break

        if nb_content:
            # Clear old outputs before pushing — nbconvert will re-generate them
            for cell in nb_content.get("cells", []):
                if cell.get("cell_type") == "code":
                    cell["outputs"] = []
                    cell["execution_count"] = None
                # Ensure source is a list (nbconvert expects this)
                src = cell.get("source", "")
                if isinstance(src, str):
                    cell["source"] = src.splitlines(True) if src else []

            body = json.dumps({"type": "notebook", "content": nb_content}).encode()
            # Check if file already exists on disk (from previous manual/interactive run)
            try:
                check = urllib.request.urlopen(
                    urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=0"),
                    timeout=10,
                )
                file_exists = check.status == 200
            except Exception:
                file_exists = False

            if file_exists:
                # File exists — read it from disk, update token, write back
                logger.info("File exists on disk, updating token in-place")
                try:
                    res = urllib.request.urlopen(
                        urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=1"), timeout=15)
                    disk_nb = json.loads(res.read()).get("content", {})
                    # Update token and URL in disk version
                    import re
                    for cell in disk_nb.get("cells", []):
                        if cell.get("cell_type") != "code":
                            continue
                        src = "".join(cell.get("source", []))
                        if "CUESTACK_TOKEN" in src:
                            updated = re.sub(
                                r'os\.environ\["CUESTACK_TOKEN"\]\s*=\s*"[^"]*"',
                                f'os.environ["CUESTACK_TOKEN"] = "{fresh_token}"',
                                src)
                            updated = re.sub(
                                r'os\.environ\["CUESTACK_URL"\]\s*=\s*"[^"]*"',
                                'os.environ["CUESTACK_URL"] = "http://nginx:80"',
                                updated)
                            cell["source"] = updated.splitlines(True)
                            break
                    # Clear outputs for fresh run
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
                # Push from DB
                body = json.dumps({"type": "notebook", "content": nb_content}).encode()
                logger.info(f"Pushing notebook ({len(body)} bytes)")
                req = urllib.request.Request(f"{user_api}/api/contents/{nb_name}", method="PUT",
                                            headers={"Content-Type": "application/json"}, data=body)
                try:
                    urllib.request.urlopen(req, timeout=30)
                except Exception as e:
                    return False, f"Failed to push notebook: {e}"

        # 4. Execute notebook via docker exec + jupyter nbconvert
        # Much more reliable than WebSocket kernel protocol
        import subprocess
        import concurrent.futures
        try:
            container_name = f"jupyter-{org_short}"
            nb_path = f"/workspace/{nb_name}"

            # Run nbconvert in a thread pool to avoid blocking the event loop
            # (the event loop also serves API requests that the notebook calls)
            def run_nbconvert():
                return subprocess.run(
                    ["docker", "exec", "-u", "jupyter", container_name,
                     "jupyter", "nbconvert", "--to", "notebook", "--execute",
                     "--ExecutePreprocessor.timeout=300",
                     "--allow-errors",
                     "--output", nb_name, nb_path],
                    capture_output=True, text=True, timeout=360,
                )

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, run_nbconvert)

            if result.returncode != 0:
                logger.error(f"nbconvert stderr: {result.stderr[:2000] if result.stderr else 'none'}")
                logger.error(f"nbconvert stdout: {result.stdout[:2000] if result.stdout else 'none'}")
                error_msg = (result.stderr or result.stdout or "Unknown error")[:1000]
                return False, f"nbconvert failed (exit={result.returncode}): {error_msg}"

            # 5. Pull executed notebook from Jupyter filesystem back to DB
            try:
                res = urllib.request.urlopen(
                    urllib.request.Request(f"{user_api}/api/contents/{nb_name}?content=1"),
                    timeout=30,
                )
                executed_nb = json.loads(res.read()).get("content")
            except Exception as e:
                return False, f"Failed to pull executed notebook: {e}"

            if executed_nb:
                page_id = task["page_id"]
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("SELECT config FROM user_pages WHERE id = %s", [page_id])
                    row = cur.fetchone()
                if row:
                    existing_cfg = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"] or "{}")
                    existing_cfg["notebook_content"] = executed_nb
                    with conn.cursor() as cur:
                        cur.execute("UPDATE user_pages SET config = %s, updated_at = NOW() WHERE id = %s",
                                    [json.dumps(existing_cfg), page_id])
                    conn.commit()

                code_cells = [c for c in executed_nb.get("cells", []) if c.get("cell_type") == "code"]
                return True, f"Notebook executed: {len(code_cells)} cells, outputs saved to DB"

            return True, "Notebook executed but no content returned"

        except subprocess.TimeoutExpired:
            return False, "Notebook execution timed out (360s)"
        except FileNotFoundError:
            return False, "Docker CLI not available in backend container"
        except Exception as e:
            return False, f"Notebook execution error: {e}"

    else:
        return True, f"Page type {page_type} — no executor configured"


async def run_scheduler():
    """Main scheduler loop — polls every POLL_INTERVAL seconds."""
    logger.info(f"Scheduler started (poll every {POLL_INTERVAL}s)")

    # Ensure task_logs table exists
    try:
        conn = get_db()
        ensure_task_logs_table(conn)
        conn.close()
        logger.info("Task logs table ready")
    except Exception as e:
        logger.error(f"Failed to create task_logs table: {e}")

    while True:
        try:
            conn = get_db()

            # Distributed lock — only one replica runs tasks at a time
            if not try_advisory_lock(conn):
                logger.debug("Another instance holds the scheduler lock, skipping")
                conn.close()
                await asyncio.sleep(POLL_INTERVAL)
                continue

            try:
                now = datetime.now(timezone.utc)
                tasks = get_scheduled_tasks(conn)

                for task in tasks:
                    if not cron_matches(task["cron"], now):
                        continue

                    # Skip if already ran this minute
                    last_run = task.get("last_run")
                    if last_run:
                        try:
                            last_dt = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
                            if (now - last_dt).total_seconds() < 55:
                                continue
                        except (ValueError, TypeError):
                            pass

                    config_ver = task["config"].get("_version", 0)
                    logger.info(f"Running: {task['page_name']} ({task['page_type']}) [{task['cron']}] v{config_ver}")
                    start_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
                    log_id = log_task_start(conn, task["page_id"], task["org_id"], config_ver)

                    try:
                        success, message = await execute_task(conn, task)
                        duration = int(datetime.now(timezone.utc).timestamp() * 1000) - start_ms
                        update_task_run(conn, task["page_id"], task["config"], success, message)
                        log_task_end(conn, log_id, success, message, duration)
                        logger.info(f"  {'OK' if success else 'FAIL'} ({duration}ms) — {message}")
                    except Exception as e:
                        duration = int(datetime.now(timezone.utc).timestamp() * 1000) - start_ms
                        error_detail = traceback.format_exc()
                        logger.error(f"  Error: {e}")
                        try:
                            update_task_run(conn, task["page_id"], task["config"], False, str(e))
                            log_task_end(conn, log_id, False, str(e), duration, error_detail)
                        except Exception:
                            pass
            finally:
                release_advisory_lock(conn)

            conn.close()
        except Exception as e:
            logger.error(f"Scheduler poll error: {e}")

        await asyncio.sleep(POLL_INTERVAL)
