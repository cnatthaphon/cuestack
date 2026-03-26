"""
Auto-injected into every notebook kernel.
Provides: db, query(), tables(), files(), read_file(), file_path()
"""
import os
import pathlib

DATABASE_URL = os.environ.get("DATABASE_URL", "")
ORG_ID = os.environ.get("ORG_ID", "")
ORG_NAME = os.environ.get("ORG_NAME", "")

# --- Database helpers ---
if DATABASE_URL:
    try:
        from sqlalchemy import create_engine, text
        import pandas as pd

        _engine = create_engine(DATABASE_URL)

        def query(sql, params=None):
            """Run SQL and return a DataFrame. Org-scoped — only sees your org's data."""
            with _engine.connect() as conn:
                return pd.read_sql(text(sql), conn, params=params or {})

        def tables():
            """List your org's tables."""
            return query(
                "SELECT name, db_type, description, row_count, created_at "
                "FROM org_tables WHERE org_id = :org_id ORDER BY name",
                {"org_id": ORG_ID}
            )

        db = _engine
    except Exception as e:
        print(f"DB connection not available: {e}")

# --- File storage helpers ---
_ORG_SHORT = ORG_ID.replace("-", "")[:8] if ORG_ID else ""
_FILES_DIR = pathlib.Path(f"/files/org_{_ORG_SHORT}") if _ORG_SHORT else None

def files(path="/"):
    """List files in your org's storage. Returns list of dicts."""
    if not _FILES_DIR:
        return []
    target = _FILES_DIR / path.lstrip("/")
    if not target.exists():
        return []
    result = []
    for entry in sorted(target.iterdir()):
        stat = entry.stat()
        result.append({
            "name": entry.name,
            "type": "directory" if entry.is_dir() else "file",
            "size": stat.st_size if entry.is_file() else 0,
        })
    return result

def read_file(path):
    """Read a file from your org's storage. Returns bytes."""
    if not _FILES_DIR:
        raise FileNotFoundError("No file storage configured")
    target = _FILES_DIR / path.lstrip("/")
    if not str(target).startswith(str(_FILES_DIR)):
        raise PermissionError("Access denied")
    return target.read_bytes()

def file_path(path):
    """Get absolute path to a file in your org's storage (read-only)."""
    if not _FILES_DIR:
        return None
    return str(_FILES_DIR / path.lstrip("/"))

# --- Print available tools ---
tools = ["query(sql)", "tables()", "db"]
if _FILES_DIR:
    tools.extend(["files()", "read_file(path)", "file_path(path)"])
print(f"Connected as org: {ORG_NAME}")
print(f"Available: {', '.join(tools)}")
