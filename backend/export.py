"""Export data events to SQLite file for download."""

import os
import sqlite3
import tempfile

import clickhouse_client


async def export_sqlite(org_id: str, channel: str = None,
                        start: str = None, end: str = None) -> str:
    """Export data events to a temporary SQLite file. Returns file path."""
    events = await clickhouse_client.query_events(
        org_id=org_id, channel=channel, start=start, end=end, limit=100000
    )

    # Create temp SQLite file
    fd, path = tempfile.mkstemp(suffix=".db", prefix="cuestack_export_")
    os.close(fd)

    conn = sqlite3.connect(path)
    conn.execute("""CREATE TABLE data_events (
        timestamp TEXT, channel TEXT, source TEXT, event_type TEXT,
        payload TEXT, metadata TEXT
    )""")

    for event in events:
        conn.execute(
            "INSERT INTO data_events VALUES (?, ?, ?, ?, ?, ?)",
            (event["timestamp"], event["channel"], event["source"],
             event["event_type"], event["payload"], event.get("metadata", "{}"))
        )

    conn.commit()
    conn.close()
    return path
