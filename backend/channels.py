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
