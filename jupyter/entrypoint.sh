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

# Drop to jupyter user and start JupyterLab
exec su -s /bin/sh jupyter -c "jupyter lab --ip=0.0.0.0 --port=8888 --no-browser"
