"""
Auto-injected into every notebook kernel.
Provides `db` (SQLAlchemy engine) and `query()` helper connected to the org's database.
"""
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
ORG_ID = os.environ.get("ORG_ID", "")
ORG_NAME = os.environ.get("ORG_NAME", "")

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

        print(f"Connected to database as org: {ORG_NAME}")
        print(f"Available: query(sql), tables(), db (SQLAlchemy engine)")
        print(f"Example:   df = query('SELECT * FROM org_tables WHERE org_id = :org_id', {{'org_id': '{ORG_ID}'}})")
    except Exception as e:
        print(f"DB connection not available: {e}")
