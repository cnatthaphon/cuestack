"""
Service Manager — runs always-on Python services as managed subprocesses.

Services are org_services rows with status='running'.
The manager starts them as subprocesses, monitors health, restarts on crash.
"""

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("services")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [services] %(message)s"))
logger.addHandler(handler)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://iot:iot123@db:5432/iotstack")
POLL_INTERVAL = 15  # check every 15s

# Running processes: {service_id: subprocess.Popen}
_processes: dict[str, subprocess.Popen] = {}


def get_db():
    return psycopg2.connect(DATABASE_URL)


def get_running_services(conn) -> list:
    """Get services that should be running."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s.id, s.name, s.entrypoint, s.org_id, s.env, s.status,
                   o.slug as org_slug
            FROM org_services s
            JOIN organizations o ON s.org_id = o.id
            WHERE s.status = 'running'
        """)
        return cur.fetchall()


def update_service_status(conn, service_id: str, status: str, message: str = ""):
    """Update service status in DB."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE org_services SET status = %s, updated_at = NOW() WHERE id = %s",
            [status, service_id]
        )
    conn.commit()


def start_service(service: dict) -> subprocess.Popen | None:
    """Start a service as a subprocess."""
    sid = str(service["id"])
    name = service["name"]
    entrypoint = service["entrypoint"]

    # Service scripts live in /app/services/ inside the container
    script_path = f"/app/services/{entrypoint}"

    # Check if it's a built-in service
    builtin_path = f"/app/{entrypoint}"
    if os.path.exists(builtin_path):
        script_path = builtin_path
    elif not os.path.exists(script_path):
        # Create services directory and write a placeholder
        os.makedirs("/app/services", exist_ok=True)
        logger.warning(f"  Script not found: {script_path}")
        return None

    env = {
        **os.environ,
        "SERVICE_NAME": name,
        "SERVICE_ID": sid,
        "ORG_ID": str(service["org_id"]),
        "ORG_SLUG": service.get("org_slug", ""),
        "DATABASE_URL": DATABASE_URL,
    }

    # Merge service-specific env
    svc_env = service.get("env", {})
    if isinstance(svc_env, str):
        try:
            svc_env = json.loads(svc_env)
        except Exception:
            svc_env = {}
    env.update(svc_env)

    try:
        proc = subprocess.Popen(
            [sys.executable, script_path],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
        )
        logger.info(f"  Started: {name} (pid={proc.pid})")
        return proc
    except Exception as e:
        logger.error(f"  Failed to start {name}: {e}")
        return None


def stop_service(sid: str):
    """Stop a running service subprocess."""
    proc = _processes.get(sid)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        logger.info(f"  Stopped: {sid} (pid={proc.pid})")
    _processes.pop(sid, None)


async def run_service_manager():
    """Main service manager loop."""
    logger.info("Service manager started")

    while True:
        try:
            conn = get_db()
            services = get_running_services(conn)
            running_ids = set()

            for svc in services:
                sid = str(svc["id"])
                running_ids.add(sid)

                # Check if already running
                if sid in _processes:
                    proc = _processes[sid]
                    if proc.poll() is not None:
                        # Process died — restart
                        exit_code = proc.returncode
                        logger.warning(f"  Service {svc['name']} died (exit={exit_code}), restarting...")
                        proc = start_service(svc)
                        if proc:
                            _processes[sid] = proc
                        else:
                            update_service_status(conn, sid, "error", f"Crashed with exit code {exit_code}")
                            _processes.pop(sid, None)
                    # else: still running, good
                else:
                    # Not started yet — start it
                    logger.info(f"Starting service: {svc['name']}")
                    proc = start_service(svc)
                    if proc:
                        _processes[sid] = proc
                    else:
                        update_service_status(conn, sid, "error", "Failed to start")

            # Stop services that should no longer be running
            for sid in list(_processes.keys()):
                if sid not in running_ids:
                    logger.info(f"Stopping removed service: {sid}")
                    stop_service(sid)

            conn.close()
        except Exception as e:
            logger.error(f"Service manager error: {e}")

        await asyncio.sleep(POLL_INTERVAL)
