#!/bin/sh
# Fix workspace permissions (volume may have been created by root)
# Then drop privileges to jupyter user

# Ensure workspace is writable by jupyter user
chown -R jupyter:jupyter /workspace 2>/dev/null || true
chmod -R 755 /workspace 2>/dev/null || true

# Ensure home dir is writable
chown -R jupyter:jupyter /home/jupyter 2>/dev/null || true

# Drop to jupyter user and start JupyterLab
exec su -s /bin/sh jupyter -c "jupyter lab --ip=0.0.0.0 --port=8888 --no-browser"
