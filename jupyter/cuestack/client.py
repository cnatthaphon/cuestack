"""
CueStack Python SDK Client.
Communicates with the platform API using a session token.
"""

import os
import json
import requests
import pandas as pd


class CueStackClient:
    """Main SDK client — authenticated access to all platform APIs."""

    def __init__(self, base_url=None, token=None):
        self.base_url = (base_url or os.environ.get("CUESTACK_URL", "http://nginx:80")).rstrip("/")
        self.token = token or os.environ.get("CUESTACK_TOKEN", "")
        self._headers = {
            "Cookie": f"cuestack-session={self.token}",
            "Content-Type": "application/json",
        }
        self.files = FileClient(self)
        self._me_cache = None

    def _get(self, path, params=None):
        r = requests.get(f"{self.base_url}{path}", headers=self._headers, params=params)
        r.raise_for_status()
        return r.json()

    def _post(self, path, data=None, files=None):
        if files:
            h = {"Cookie": f"cuestack-session={self.token}"}
            r = requests.post(f"{self.base_url}{path}", headers=h, data=data, files=files)
        else:
            r = requests.post(f"{self.base_url}{path}", headers=self._headers, json=data)
        r.raise_for_status()
        return r.json()

    def _patch(self, path, data=None):
        r = requests.patch(f"{self.base_url}{path}", headers=self._headers, json=data)
        r.raise_for_status()
        return r.json()

    def _delete(self, path, params=None):
        r = requests.delete(f"{self.base_url}{path}", headers=self._headers, params=params)
        r.raise_for_status()
        return r.json()

    # --- User & Org ---

    def me(self):
        """Get current user info."""
        if not self._me_cache:
            self._me_cache = self._get("/api/auth/me")
        return self._me_cache

    def users(self):
        """List org users. Returns DataFrame."""
        data = self._get("/api/users")
        return pd.DataFrame(data.get("users", []))

    def org(self):
        """Get current org info."""
        return self.me().get("org", {})

    # --- Data ---

    def tables(self):
        """List org tables. Returns DataFrame."""
        data = self._get("/api/tables")
        df = pd.DataFrame(data.get("tables", []))
        if len(df) > 0 and "columns" in df.columns:
            df["columns"] = df["columns"].apply(
                lambda c: ", ".join(f"{col['name']}:{col['type']}" for col in (json.loads(c) if isinstance(c, str) else c))
            )
        return df

    def query(self, table, limit=100, order_by=None, order_dir="DESC"):
        """Query data from an org table. Returns DataFrame."""
        params = {"limit": limit}
        if order_by:
            params["order_by"] = order_by
            params["order_dir"] = order_dir
        # Use the internal v1 API pattern — but we need org context
        # For notebook, use the tables API via pipeline
        data = self._get(f"/api/pipeline/query")
        return pd.DataFrame(data.get("data", []))

    def query_table(self, table_name, limit=100):
        """Query a specific org table by name. Returns DataFrame.

        Uses the widget-data API which supports arbitrary table queries.
        """
        data = self._post("/api/dashboards/widget-data", {
            "widget": {
                "type": "table",
                "config": {"table": table_name, "max_rows": limit}
            }
        })
        rows = data.get("data", {}).get("rows", [])
        return pd.DataFrame(rows)

    def insert(self, table_name, rows):
        """Insert rows into an org table. Rows: list of dicts."""
        # Need an API key for external API — use internal route
        data = self._post("/api/pipeline/ingest", {"table": table_name, "data": rows})
        return data

    # --- Notifications ---

    def notify(self, title, message="", type="info", user_id=None, source="notebook"):
        """Send a notification.
        type: info, success, warning, error
        user_id: specific user (default: self)
        """
        body = {"title": title, "message": message, "type": type, "source": source}
        if user_id:
            body["user_id"] = user_id
        return self._post("/api/notifications", body)

    def broadcast(self, title, message="", type="info", source="notebook"):
        """Send notification to all org users (via all user IDs)."""
        users = self._get("/api/users").get("users", [])
        count = 0
        for u in users:
            self._post("/api/notifications", {
                "title": title, "message": message, "type": type,
                "source": source, "user_id": u["id"],
            })
            count += 1
        return {"sent_to": count}

    # --- Dashboards ---

    def dashboards(self):
        """List org dashboards."""
        data = self._get("/api/dashboards")
        return pd.DataFrame(data.get("dashboards", []))

    # --- Services ---

    def services(self):
        """List org services."""
        data = self._get("/api/services")
        return pd.DataFrame(data.get("services", []))

    # --- Apps ---

    def apps(self):
        """List org apps."""
        data = self._get("/api/apps")
        return pd.DataFrame(data.get("apps", []))

    def __repr__(self):
        me = self.me()
        user = me.get("user", {})
        org = me.get("org", {})
        return f"CueStackClient(user={user.get('username')}, org={org.get('name')}, plan={org.get('plan')})"


class FileClient:
    """File operations — personal files with sharing."""

    def __init__(self, client):
        self._c = client

    def list(self, view="my", parent_id=None):
        """List files. view: my, shared, org"""
        params = {"view": view}
        if parent_id:
            params["parent"] = parent_id
        data = self._c._get("/api/files", params)
        return pd.DataFrame(data.get("files", []))

    def my(self, parent_id=None):
        """List my files."""
        return self.list("my", parent_id)

    def shared(self):
        """List files shared with me."""
        return self.list("shared")

    def org_files(self, parent_id=None):
        """List org-visible files."""
        return self.list("org", parent_id)

    def upload(self, filepath, parent_id=None, visibility="private"):
        """Upload a local file."""
        import os
        filename = os.path.basename(filepath)
        with open(filepath, "rb") as f:
            data = {"visibility": visibility}
            if parent_id:
                data["parent_id"] = parent_id
            return self._c._post("/api/files", data=data, files={"file": (filename, f)})

    def download(self, file_id, save_as=None):
        """Download a file. Returns bytes or saves to path."""
        r = requests.get(
            f"{self._c.base_url}/api/files/download?id={file_id}",
            headers={"Cookie": f"cuestack-session={self._c.token}"},
        )
        r.raise_for_status()
        if save_as:
            with open(save_as, "wb") as f:
                f.write(r.content)
            return save_as
        return r.content

    def mkdir(self, name, parent_id=None, visibility="private"):
        """Create a directory."""
        return self._c._post("/api/files", {"action": "mkdir", "name": name, "parent_id": parent_id, "visibility": visibility})

    def rename(self, file_id, new_name):
        """Rename a file or directory."""
        return self._c._post("/api/files", {"action": "rename", "id": file_id, "name": new_name})

    def move(self, file_id, new_parent_id=None):
        """Move file to another directory."""
        return self._c._post("/api/files", {"action": "move", "id": file_id, "parent_id": new_parent_id})

    def share(self, file_id, user_ids=None, role_ids=None):
        """Share file with users/roles."""
        share_with = []
        if user_ids:
            share_with.extend({"type": "user", "id": uid} for uid in user_ids)
        if role_ids:
            share_with.extend({"type": "role", "id": rid} for rid in role_ids)
        return self._c._post("/api/files", {"action": "share", "id": file_id, "share_with": share_with})

    def set_visibility(self, file_id, visibility):
        """Set visibility: private, org, public"""
        return self._c._post("/api/files", {"action": "set_visibility", "id": file_id, "visibility": visibility})

    def storage(self):
        """Get storage stats."""
        data = self._c._get("/api/files")
        return data.get("storage", {})


def connect(base_url=None, token=None):
    """Create and return a connected CueStack client.

    In notebooks, auto-connects using environment variables.
    """
    client = CueStackClient(base_url, token)
    # Test connection
    try:
        me = client.me()
        user = me.get("user", {})
        org = me.get("org", {})
        print(f"Connected to CueStack as {user.get('username')} ({org.get('name')} - {org.get('plan')} plan)")
    except Exception as e:
        print(f"Connection failed: {e}")
    return client
