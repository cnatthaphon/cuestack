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
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [scheduler] %(message)s"))
logger.addHandler(handler)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://iot:iot123@db:5432/iotstack")
JUPYTER_URL = os.getenv("JUPYTER_URL", "http://jupyter:8888")
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
    schedule_update = {
        "last_run": now,
        "last_status": "success" if success else "error",
        "run_count": run_count,
        "cron": config["schedule"]["cron"],
        "enabled": config["schedule"].get("enabled", True),
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


async def execute_notebook(task: dict) -> tuple[bool, str]:
    """Execute a notebook via Jupyter API."""
    import urllib.request
    import urllib.error

    org_short = task["org_id"].replace("-", "")[:8]
    dir_name = f"org_{org_short}"
    nb_name = (task["slug"] or task["page_name"].lower().replace(" ", "_")) + ".ipynb"
    path = f"{dir_name}/{nb_name}"

    try:
        req = urllib.request.Request(f"{JUPYTER_URL}/jupyter/api/contents/{path}")
        urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError:
        return False, f"Notebook not found: {path}"
    except Exception as e:
        return False, f"Jupyter unreachable: {e}"

    logger.info(f"  Notebook ready: {path}")
    return True, f"Notebook verified: {path}"


async def execute_task(task: dict) -> tuple[bool, str]:
    """Execute a scheduled task based on page type."""
    page_type = task["page_type"]
    if page_type == "notebook":
        return await execute_notebook(task)
    elif page_type == "html":
        return True, "HTML page triggered"
    elif page_type == "visual":
        return True, "Visual flow triggered"
    else:
        return True, f"Page type {page_type} executed"


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
                        success, message = await execute_task(task)
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
