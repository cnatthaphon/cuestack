"""
Run Python code in an org's Jupyter container.

This is the backend handler for "Run Once" on Python pages.
Code runs inside the org's isolated Docker container — same sandbox
as notebooks and services. Auth is enforced by the frontend API route
(ownership + page_type check) before this is called.
"""

import asyncio
import logging
import subprocess

logger = logging.getLogger("run-python")


async def execute_in_container(org_id: str, page_id: str, code: str, timeout: int = 30) -> dict:
    """Execute Python code in the org's Jupyter container."""
    org_short = org_id.replace("-", "")[:8]
    container = f"jupyter-{org_short}"
    timeout = min(timeout, 60)
    script = f"/tmp/_run_{page_id[:8]}.py"

    def _run():
        # Write script to container (-i enables stdin forwarding)
        write_result = subprocess.run(
            ["docker", "exec", "-i", container, "sh", "-c", f"cat > {script}"],
            input=code.encode(), capture_output=True, timeout=10,
        )
        if write_result.returncode != 0:
            return {
                "error": "Jupyter container not running. Open a notebook first or enable the service.",
                "stdout": "", "stderr": "", "ok": False,
            }

        # Execute script
        result = subprocess.run(
            ["docker", "exec", "-u", "jupyter",
             "-e", f"ORG_ID={org_id}",
             container, "python3", script],
            capture_output=True, text=True, timeout=timeout + 5,
        )

        # Cleanup temp file
        subprocess.run(
            ["docker", "exec", container, "rm", "-f", script],
            capture_output=True, timeout=5,
        )

        return {
            "stdout": result.stdout[:10000],
            "stderr": result.stderr[:5000],
            "exit_code": result.returncode,
            "ok": result.returncode == 0,
        }

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _run)
    except subprocess.TimeoutExpired:
        return {"error": f"Execution timed out ({timeout}s)", "stdout": "", "stderr": "", "ok": False}
    except Exception as e:
        return {"error": str(e), "stdout": "", "stderr": "", "ok": False}
