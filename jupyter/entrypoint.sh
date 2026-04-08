#!/bin/sh
# Fix workspace permissions (volume may have been created by root)
# Then drop privileges to jupyter user

# Ensure workspace is writable by jupyter user
chown -R jupyter:jupyter /workspace 2>/dev/null || true
chmod -R 755 /workspace 2>/dev/null || true

# Ensure home dir and custom envs are writable
chown -R jupyter:jupyter /home/jupyter 2>/dev/null || true

# Register any existing custom kernels from persistent envs volume
if [ -d /home/jupyter/envs ]; then
    chown -R jupyter:jupyter /home/jupyter/envs 2>/dev/null || true
    for env in /home/jupyter/envs/*/; do
        if [ -f "$env/bin/python" ]; then
            envname=$(basename "$env")
            su -s /bin/sh jupyter -c "$env/bin/python -m ipykernel install --user --name=$envname" 2>/dev/null || true
        fi
    done
fi

# ---------------------------------------------------------------------------
# Security: clear sensitive environment variables before dropping to user.
# JupyterHub injects JUPYTERHUB_API_TOKEN, JUPYTERHUB_CLIENT_ID, etc. into
# spawned containers. These give the bearer access to the Hub REST API and
# must NOT be visible to notebook code (os.environ). We preserve only the
# vars the CueStack SDK needs: CUESTACK_URL, ORG_ID, ORG_NAME, ORG_PLAN.
# ---------------------------------------------------------------------------
unset JUPYTERHUB_API_TOKEN
unset JUPYTERHUB_API_URL
unset JUPYTERHUB_CLIENT_ID
unset JUPYTERHUB_HOST
unset JUPYTERHUB_OAUTH_CALLBACK_URL
unset JUPYTERHUB_OAUTH_SCOPES
unset JUPYTERHUB_OAUTH_ACCESS_SCOPES
unset JUPYTERHUB_USER
unset JUPYTERHUB_SERVER_NAME
unset JUPYTERHUB_ACTIVITY_URL
# Keep JUPYTERHUB_SERVICE_PREFIX — Jupyter needs it for routing
# Keep CUESTACK_URL, ORG_ID, ORG_NAME, ORG_PLAN — SDK needs these

# Drop to jupyter user and start JupyterLab
# --no-browser: no local browser launch (container has no display)
# --ServerApp.allow_remote_access=True: required for container networking
exec su -s /bin/sh jupyter -c "jupyter lab --ip=0.0.0.0 --port=8888 --no-browser"
