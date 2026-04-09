import os
import json
from dockerspawner import DockerSpawner
from jupyterhub.auth import Authenticator
import requests

c = get_config()  # noqa: F821

PLATFORM_URL = os.environ.get('CUESTACK_URL', 'http://frontend:3000')
PLATFORM_DB = os.environ.get('DATABASE_URL', '')

# ---------------------------------------------------------------------------
# Custom authenticator — validates CueStack JWT, returns org info
# ---------------------------------------------------------------------------
class CueStackAuthenticator(Authenticator):
    """Authenticate via CueStack platform JWT.
    Returns org_short as username (per-org container isolation).
    Stores org plan/limits in auth_state for the spawner to read.
    """
    enable_auth_state = True

    async def authenticate(self, handler, data):
        username = data.get('username', '')
        token = data.get('password', '')
        if not token:
            return None

        try:
            resp = requests.get(
                f'{PLATFORM_URL}/api/auth/me',
                cookies={'cuestack-session': token},
                timeout=5,
            )
            if resp.status_code == 200:
                user_data = resp.json()
                org_id = user_data.get('user', {}).get('org_id', '')
                org_short = org_id.replace('-', '')[:8]
                org = user_data.get('org', {})
                return {
                    'name': org_short,
                    'auth_state': {
                        'org_id': org_id,
                        'org_name': org.get('name', ''),
                        'plan': org.get('plan', 'free'),
                        'token': token,
                    }
                }
        except Exception:
            pass
        return None

c.JupyterHub.authenticator_class = CueStackAuthenticator

# ---------------------------------------------------------------------------
# Custom spawner — reads org limits from DB, supports custom envs
# ---------------------------------------------------------------------------
class CueStackSpawner(DockerSpawner):
    """Spawner that reads resource limits from org plan in the database."""

    # Default resource limits per plan
    PLAN_LIMITS = {
        'free': {'mem': '256M', 'cpu': 0.5, 'storage': '1G'},
        'starter': {'mem': '512M', 'cpu': 1.0, 'storage': '5G'},
        'professional': {'mem': '1G', 'cpu': 2.0, 'storage': '20G'},
        'enterprise': {'mem': '2G', 'cpu': 4.0, 'storage': '50G'},
    }

    async def start(self):
        """Read org limits from auth_state, then spawn container."""
        auth_state = await self.user.get_auth_state()
        plan = (auth_state or {}).get('plan', 'free')
        org_id = (auth_state or {}).get('org_id', '')
        org_name = (auth_state or {}).get('org_name', '')

        # Get limits from plan (or override from DB)
        limits = self.PLAN_LIMITS.get(plan, self.PLAN_LIMITS['free'])

        # Try to read custom limits from DB
        if PLATFORM_DB:
            try:
                import psycopg2
                import psycopg2.extras
                conn = psycopg2.connect(PLATFORM_DB)
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        "SELECT plan, max_users, max_devices, storage_limit_mb FROM organizations WHERE id = %s",
                        [org_id]
                    )
                    org_row = cur.fetchone()
                    if org_row:
                        plan = org_row.get('plan', plan)
                        limits = self.PLAN_LIMITS.get(plan, limits)
                        # Override storage if custom limit set
                        if org_row.get('storage_limit_mb'):
                            limits = {**limits, 'storage': f"{org_row['storage_limit_mb']}M"}
                conn.close()
            except Exception as e:
                self.log.warning(f"Failed to read org limits from DB: {e}")

        # Apply resource limits
        self.mem_limit = limits['mem']
        self.cpu_limit = limits['cpu']

        # Set org info in container environment
        self.environment.update({
            'ORG_ID': org_id,
            'ORG_NAME': org_name,
            'ORG_PLAN': plan,
        })

        self.log.info(f"Spawning container for org {org_name} ({plan}): "
                      f"mem={limits['mem']}, cpu={limits['cpu']}")

        return await super().start()


c.JupyterHub.spawner_class = CueStackSpawner
c.DockerSpawner.image = 'cuestack-jupyter-user'
c.DockerSpawner.network_name = 'cuestack_default'
c.DockerSpawner.remove = True
c.DockerSpawner.cmd = ['/entrypoint.sh']

# Per-org volume — isolated filesystem per org
c.DockerSpawner.volumes = {
    'jupyter-{username}': '/workspace',
    'jupyter-{username}-envs': '/home/jupyter/envs',  # Custom Python environments persist
}

# Base environment for all containers
c.DockerSpawner.environment = {
    'CUESTACK_URL': 'http://nginx:80',
}

# ---------------------------------------------------------------------------
# Security: container resource limits and hardening
# ---------------------------------------------------------------------------
# pids_limit: cap forked processes to prevent fork-bombs and runaway pip installs.
# mem_limit / cpu_limit are set per-plan in CueStackSpawner.start().
# Network note: containers join cuestack_default and CAN reach internal services
# (backend, clickhouse, etc.). This is accepted risk because each container is
# org-scoped and the CueStack SDK needs backend access. To fully isolate, move
# notebook containers to a dedicated network with only backend access.
c.DockerSpawner.extra_host_config = {
    'pids_limit': 256,        # prevent fork-bombs; 100 was too low for nbconvert + running kernel
    'read_only': False,       # /workspace must be writable; site-packages is chmod'd
    'security_opt': ['no-new-privileges'],  # prevent privilege escalation via setuid
}

# ---------------------------------------------------------------------------
# Hub networking
# ---------------------------------------------------------------------------
c.JupyterHub.hub_ip = '0.0.0.0'
c.JupyterHub.hub_port = 8081
c.JupyterHub.base_url = '/jupyter/'
c.JupyterHub.hub_connect_ip = 'jupyterhub'

# ---------------------------------------------------------------------------
# Admin / security
# ---------------------------------------------------------------------------
c.JupyterHub.admin_access = False

# ---------------------------------------------------------------------------
# Services — platform API token + idle culling
# ---------------------------------------------------------------------------
PLATFORM_API_TOKEN = os.environ.get('JUPYTERHUB_API_TOKEN', 'cuestack-hub-api-token-change-in-prod')
c.JupyterHub.services = [
    {
        'name': 'cuestack-platform',
        'api_token': PLATFORM_API_TOKEN,
    },
    {
        'name': 'cull-idle',
        'admin': True,
        'command': ['python3', '-m', 'jupyterhub_idle_culler', '--timeout=1800'],
    },
]

# Grant platform service full API access (create users, spawn/stop servers)
c.JupyterHub.load_roles = [
    {
        'name': 'cuestack-platform-role',
        'scopes': ['admin:users', 'admin:servers', 'read:users', 'read:servers'],
        'services': ['cuestack-platform'],
    },
]

# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
c.JupyterHub.cookie_secret_file = '/data/jupyterhub_cookie_secret'
c.JupyterHub.db_file = '/data/jupyterhub.sqlite'
