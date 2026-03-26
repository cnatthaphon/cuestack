import os

c = get_config()  # noqa: F821

# Auth: disable token — platform handles auth via login + nginx proxy.
# Jupyter is NOT exposed to the internet, only accessible through nginx
# which requires platform authentication to reach /jupyter/*.
c.ServerApp.token = ""
c.ServerApp.password = ""
c.ServerApp.disable_check_xsrf = True

# Allow embedding in iframe + WebSocket from same origin
c.ServerApp.tornado_settings = {
    "headers": {
        "Content-Security-Policy": "frame-ancestors 'self' *",
        "Access-Control-Allow-Origin": "*",
    },
    "websocket_ping_interval": 30,
    "websocket_ping_timeout": 20,
}
c.ServerApp.allow_origin = "*"
c.ServerApp.allow_credentials = True

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
