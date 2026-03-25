import os

c = get_config()  # noqa: F821

# Security: token-based auth (token set via env var)
c.ServerApp.token = os.environ.get("JUPYTER_TOKEN", "")
c.ServerApp.password = ""

# Allow embedding in iframe (platform proxies through auth)
c.ServerApp.tornado_settings = {
    "headers": {
        "Content-Security-Policy": "frame-ancestors 'self' *",
    }
}

# Base URL — proxied under /jupyter/
c.ServerApp.base_url = "/jupyter/"

# Disable logout (handled by platform)
c.ServerApp.logout_redirect_url = "/"

# Workspace per org (set via env var, default /workspace)
c.ServerApp.root_dir = os.environ.get("JUPYTER_WORKSPACE", "/workspace")

# Auto-run startup script to inject DB connection
c.InteractiveShellApp.exec_files = ["/root/.jupyter/startup.py"]

# Disable terminal for security (users use notebooks only)
c.ServerApp.terminals_enabled = False
