import os
from dockerspawner import DockerSpawner
from jupyterhub.auth import Authenticator
from tornado import gen
import requests

c = get_config()  # noqa: F821

# ---------------------------------------------------------------------------
# Custom authenticator — validates CueStack JWT via the platform API
# ---------------------------------------------------------------------------
class CueStackAuthenticator(Authenticator):
    """Authenticate via CueStack platform JWT.

    The notebook API passes org_short as username and the session cookie
    value as password.  We validate against /api/auth/me and return
    the org_short identifier so JupyterHub treats each *org* as a user
    (per-org isolation, not per-person).
    """

    async def authenticate(self, handler, data):
        """Validate username/password against CueStack API."""
        username = data.get('username', '')
        token = data.get('password', '')

        if not token:
            return None

        # Validate token against CueStack backend
        try:
            platform_url = os.environ.get('CUESTACK_URL', 'http://frontend:3000')
            resp = requests.get(
                f'{platform_url}/api/auth/me',
                cookies={'cuestack-session': token},
                timeout=5,
            )
            if resp.status_code == 200:
                user_data = resp.json()
                org_id = user_data.get('user', {}).get('org_id', '')
                org_short = org_id.replace('-', '')[:8]
                # Return org_short as the JupyterHub username (per-org isolation)
                return org_short
        except Exception:
            pass
        return None


c.JupyterHub.authenticator_class = CueStackAuthenticator

# ---------------------------------------------------------------------------
# Docker spawner — one container per org
# ---------------------------------------------------------------------------
c.JupyterHub.spawner_class = 'dockerspawner.DockerSpawner'
c.DockerSpawner.image = 'cuestack-jupyter-user'
c.DockerSpawner.network_name = 'cuestack_default'
c.DockerSpawner.remove = True  # Remove container when stopped

# Per-org volume mount — username is the org_short identifier
c.DockerSpawner.volumes = {
    'jupyter-{username}': '/workspace',
}

# Environment passed into every spawned user container
c.DockerSpawner.environment = {
    'CUESTACK_URL': 'http://nginx:80',
}

# Resource limits per org container
c.DockerSpawner.mem_limit = '512M'
c.DockerSpawner.cpu_limit = 1.0

# ---------------------------------------------------------------------------
# Hub networking
# ---------------------------------------------------------------------------
c.JupyterHub.hub_ip = '0.0.0.0'
c.JupyterHub.hub_port = 8000
c.JupyterHub.base_url = '/jupyter/'

# The hub must be reachable from spawned containers via the Docker network.
# 'jupyterhub' is the compose service name which Docker DNS resolves.
c.JupyterHub.hub_connect_ip = 'jupyterhub'

# ---------------------------------------------------------------------------
# Admin / security
# ---------------------------------------------------------------------------
c.JupyterHub.admin_access = False

# ---------------------------------------------------------------------------
# Idle culling — stop org containers after 30 min idle
# ---------------------------------------------------------------------------
c.JupyterHub.services = [
    {
        'name': 'cull-idle',
        'admin': True,
        'command': ['python3', '-m', 'jupyterhub_idle_culler', '--timeout=1800'],
    }
]

# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
c.JupyterHub.cookie_secret_file = '/data/jupyterhub_cookie_secret'
c.JupyterHub.db_file = '/data/jupyterhub.sqlite'
