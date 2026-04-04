"""
Real-time channel manager — WebSocket pub/sub hub.

Manages connected clients, channel subscriptions, and message routing.
Authenticates via channel tokens (cht_...) or session JWT.

Architecture:
  Publisher (device/script) → POST /api/channels/publish → broadcast to subscribers
  Subscriber (browser/app) → WebSocket /ws/channels → receives messages

Later: MQTT broker bridges to the same channel manager.
"""

import asyncio
import json
import hashlib
import logging
import os
from datetime import datetime, timezone
from collections import defaultdict

import psycopg2
import psycopg2.extras

import clickhouse_client

logger = logging.getLogger("channels")

DATABASE_URL = os.getenv("DATABASE_URL", "")

# In-memory subscriber registry: channel_key → set of WebSocket connections
_subscribers: dict[str, set] = defaultdict(set)
# Connection → {org_id, channels: set}
_connections: dict = {}

# Message buffer for recent messages (per channel, max 100)
_recent: dict[str, list] = defaultdict(list)
MAX_RECENT = 100


def _channel_key(org_id: str, channel_name: str) -> str:
    return f"{org_id}:{channel_name}"


def authenticate_token(token: str) -> dict | None:
    """Verify a channel token. Returns {org_id, permissions} or None."""
    if not token or not token.startswith("cht_"):
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT org_id, permissions FROM channel_tokens WHERE token_hash = %s AND is_active = true",
                [token_hash]
            )
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE channel_tokens SET last_used_at = NOW() WHERE token_hash = %s", [token_hash])
                conn.commit()
        conn.close()
        if row:
            return {"org_id": str(row["org_id"]), "permissions": row["permissions"]}
    except Exception as e:
        logger.error(f"Token auth error: {e}")
    return None


def get_org_channels(org_id: str) -> list:
    """Get active channels for an org."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT name FROM org_channels WHERE org_id = %s AND is_active = true", [org_id])
            rows = cur.fetchall()
        conn.close()
        return [r["name"] for r in rows]
    except Exception:
        return []


async def subscribe(ws, org_id: str, channel_name: str):
    """Subscribe a WebSocket to a channel."""
    key = _channel_key(org_id, channel_name)
    _subscribers[key].add(ws)
    if ws not in _connections:
        _connections[ws] = {"org_id": org_id, "channels": set()}
    _connections[ws]["channels"].add(channel_name)
    logger.info(f"Subscribe: {channel_name} (org={org_id[:8]}), {len(_subscribers[key])} clients")


async def unsubscribe(ws, org_id: str, channel_name: str):
    """Unsubscribe a WebSocket from a channel."""
    key = _channel_key(org_id, channel_name)
    _subscribers[key].discard(ws)
    if ws in _connections:
        _connections[ws]["channels"].discard(channel_name)


async def disconnect(ws):
    """Clean up all subscriptions for a disconnected WebSocket."""
    info = _connections.pop(ws, None)
    if info:
        for ch in info.get("channels", []):
            key = _channel_key(info["org_id"], ch)
            _subscribers[key].discard(ws)


# --- Batch buffer for ClickHouse inserts ---
# Why batch? Single inserts at 1000 msg/sec = 1000 HTTP calls/sec (slow).
# Batch buffer collects messages, flushes every 1s or 500 msgs (whichever first).
# One HTTP call with 500 rows is 100x faster than 500 single inserts.
_batch_buffer: list = []
_batch_lock = asyncio.Lock()
BATCH_SIZE = 500       # flush when buffer reaches this size
BATCH_INTERVAL = 1.0   # flush every N seconds regardless of size
_batch_task = None


async def _flush_batch():
    """Flush the batch buffer to ClickHouse."""
    async with _batch_lock:
        if not _batch_buffer:
            return
        batch = _batch_buffer.copy()
        _batch_buffer.clear()

    if not batch:
        return

    try:
        # Build bulk insert: one HTTP call for all rows
        rows = []
        for event in batch:
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            payload_str = json.dumps(event["data"])
            rows.append(
                f"('{ts}', '{event['org_id']}', '{event['channel']}', 'channel', 'data', '{payload_str}', '{{}}')"
            )
        if rows:
            values = ",\n".join(rows)
            query = f"""INSERT INTO data_events (timestamp, org_id, channel, source, event_type, payload, metadata)
            VALUES {values}"""

            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    clickhouse_client.CLICKHOUSE_URL,
                    params={"database": clickhouse_client.CLICKHOUSE_DB, "query": query},
                    auth=(clickhouse_client.CLICKHOUSE_USER, clickhouse_client.CLICKHOUSE_PASSWORD),
                    timeout=30.0,
                )
                resp.raise_for_status()

        logger.info(f"Batch flush: {len(batch)} events to ClickHouse")
    except Exception as e:
        logger.warning(f"Batch flush failed ({len(batch)} events): {e}")


async def _batch_flush_loop():
    """Background task: flush batch buffer every BATCH_INTERVAL seconds."""
    while True:
        await asyncio.sleep(BATCH_INTERVAL)
        await _flush_batch()


def _ensure_batch_task():
    """Start the background flush loop if not running."""
    global _batch_task
    if _batch_task is None or _batch_task.done():
        _batch_task = asyncio.create_task(_batch_flush_loop())


async def _buffer_event(org_id: str, channel_name: str, data: dict):
    """Add event to batch buffer. Flushes automatically."""
    _ensure_batch_task()
    async with _batch_lock:
        _batch_buffer.append({"org_id": org_id, "channel": channel_name, "data": data})
        if len(_batch_buffer) >= BATCH_SIZE:
            pass  # will be flushed by size check below

    # Flush if buffer is full (don't wait for timer)
    if len(_batch_buffer) >= BATCH_SIZE:
        await _flush_batch()


async def publish(org_id: str, channel_name: str, data: dict):
    """Publish a message to a channel. Broadcasts to all subscribers."""
    key = _channel_key(org_id, channel_name)
    message = {
        "channel": channel_name,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    msg_json = json.dumps(message)

    # Store in recent buffer
    _recent[key].append(message)
    if len(_recent[key]) > MAX_RECENT:
        _recent[key] = _recent[key][-MAX_RECENT:]

    # Update message count in DB (async-safe, fire-and-forget)
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE org_channels SET message_count = message_count + 1, last_message_at = NOW() WHERE org_id = %s AND name = %s",
                [org_id, channel_name]
            )
        conn.commit()
        conn.close()
    except Exception:
        pass

    # Buffer event for batch insert to ClickHouse (fire-and-forget)
    asyncio.create_task(_buffer_event(org_id, channel_name, data))

    # Broadcast to subscribers
    dead = set()
    for ws in _subscribers.get(key, set()):
        try:
            await ws.send_text(msg_json)
        except Exception:
            dead.add(ws)

    # Clean up dead connections
    for ws in dead:
        _subscribers[key].discard(ws)
        await disconnect(ws)

    return len(_subscribers.get(key, set()))


def get_recent(org_id: str, channel_name: str, limit: int = 20) -> list:
    """Get recent messages for a channel."""
    key = _channel_key(org_id, channel_name)
    return _recent.get(key, [])[-limit:]


def get_stats() -> dict:
    """Get channel stats."""
    return {
        "total_subscribers": sum(len(s) for s in _subscribers.values()),
        "total_channels": len(_subscribers),
        "total_connections": len(_connections),
    }
