import os
import json
import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger("clickhouse")

CLICKHOUSE_URL = os.getenv("CLICKHOUSE_URL", "http://clickhouse:8123")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "cuestack")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "cuestack")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "cuestack123")


async def execute(query: str, params: dict = None) -> str:
    """Execute a ClickHouse query via HTTP interface."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CLICKHOUSE_URL,
            params={"database": CLICKHOUSE_DB, "query": query},
            auth=(CLICKHOUSE_USER, CLICKHOUSE_PASSWORD),
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.text


async def insert_event(org_id: str, channel: str, source: str, payload: dict,
                       event_type: str = "data", metadata: dict = None):
    """Insert a data event into ClickHouse."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    meta = json.dumps(metadata or {})
    payload_str = json.dumps(payload)
    query = f"""INSERT INTO data_events (timestamp, org_id, channel, source, event_type, payload, metadata)
    VALUES ('{now}', '{org_id}', '{channel}', '{source}', '{event_type}', '{payload_str}', '{meta}')"""
    await execute(query)


async def insert_audit(org_id: str, user_id: str, entity_type: str, entity_id: str,
                       action: str, old_value: dict = None, new_value: dict = None,
                       ip_address: str = ""):
    """Insert an audit log entry."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    old_str = json.dumps(old_value or {})
    new_str = json.dumps(new_value or {})
    query = f"""INSERT INTO audit_log (timestamp, org_id, user_id, entity_type, entity_id, action, old_value, new_value, ip_address)
    VALUES ('{now}', '{org_id}', '{user_id}', '{entity_type}', '{entity_id}', '{action}', '{old_str}', '{new_str}', '{ip_address}')"""
    await execute(query)


async def query_events(org_id: str, channel: str = None, source: str = None,
                       start: str = None, end: str = None, limit: int = 100) -> list:
    """Query data events with filters."""
    where = [f"org_id = '{org_id}'"]
    if channel:
        where.append(f"channel = '{channel}'")
    if source:
        where.append(f"source = '{source}'")
    if start:
        where.append(f"timestamp >= '{start}'")
    if end:
        where.append(f"timestamp <= '{end}'")

    query = f"""SELECT timestamp, channel, source, event_type, payload, metadata
    FROM data_events
    WHERE {' AND '.join(where)}
    ORDER BY timestamp DESC
    LIMIT {limit}
    FORMAT JSON"""
    result = await execute(query)
    return json.loads(result).get("data", [])


async def query_audit(org_id: str, entity_type: str = None, entity_id: str = None,
                      limit: int = 50) -> list:
    """Query audit log."""
    where = [f"org_id = '{org_id}'"]
    if entity_type:
        where.append(f"entity_type = '{entity_type}'")
    if entity_id:
        where.append(f"entity_id = '{entity_id}'")

    query = f"""SELECT timestamp, user_id, entity_type, entity_id, action, old_value, new_value
    FROM audit_log
    WHERE {' AND '.join(where)}
    ORDER BY timestamp DESC
    LIMIT {limit}
    FORMAT JSON"""
    result = await execute(query)
    return json.loads(result).get("data", [])
