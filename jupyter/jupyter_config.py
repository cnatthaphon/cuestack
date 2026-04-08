import os

c = get_config()  # noqa: F821

# Auth: disable token — JupyterHub handles authentication.
# When spawned by JupyterHub, the hub sets JUPYTERHUB_API_TOKEN etc.
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

# Base URL — when spawned by JupyterHub, JUPYTERHUB_SERVICE_PREFIX is set
# automatically. Fall back to /jupyter/ for standalone testing.
c.ServerApp.base_url = os.environ.get("JUPYTERHUB_SERVICE_PREFIX", "/jupyter/")

# Disable logout (handled by platform)
c.ServerApp.logout_redirect_url = "/"

# Workspace per org (set via env var, default /workspace)
# Security note: /workspace is a per-org Docker volume. All users in the same
# org share this volume (and see each other's files). This is by design —
# org-level isolation, not user-level. The volume name is keyed on the org's
# short ID (jupyter-{org_short}) so different orgs never share storage.
c.ServerApp.root_dir = os.environ.get("JUPYTER_WORKSPACE", "/workspace")

# Auto-run startup script to inject SDK connection
c.InteractiveShellApp.exec_files = ["/home/jupyter/.jupyter/startup.py"]

# Disable terminal for security (users use notebooks only).
# Note: users can still run shell commands via !cmd or subprocess in notebook
# cells. With no sudo, no terminal, and no-new-privileges on the container,
# damage is limited to the org's own /workspace volume and processes.
c.ServerApp.terminals_enabled = False

# Lock down: platform manages notebook files, Jupyter is just the editor
# Hide launcher and file browser in JupyterLab
c.LabApp.default_url = "/doc"  # default to single-document mode
c.ContentsManager.allow_hidden = False

# Disable news/update notifications popup
c.LabApp.news_url = ""
c.LabApp.check_for_updates_class = "jupyterlab.NeverCheckForUpdate"

# Hide Hub menu items (Log Out, Shutdown) — platform manages lifecycle
