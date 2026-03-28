"""
MQTT Device Authentication -- validates channel tokens for MQTT connections.

Architecture:
- Mosquitto runs on internal Docker network (not exposed to internet)
- Services authenticate via channel tokens stored in DB
- External devices use HTTP/WebSocket APIs which validate tokens
- MQTT bridge validates org routing for all messages
- Device registry tracks active devices based on message activity
"""

import hashlib
import logging
import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("mqtt_auth")
DATABASE_URL = os.getenv("DATABASE_URL", "")


def validate_device_token(token: str) -> dict | None:
    """Validate a channel token for MQTT device auth.
    Returns {org_id, token_id, permissions, org_short} or None."""
    if not token or not token.startswith("cht_"):
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT t.id as token_id, t.org_id, t.permissions, t.name,
                       o.slug as org_slug
                FROM channel_tokens t
                JOIN organizations o ON t.org_id = o.id
                WHERE t.token_hash = %s AND t.is_active = true
            """, [token_hash])
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE channel_tokens SET last_used_at = NOW() WHERE id = %s", [row["token_id"]])
                conn.commit()
                org_short = str(row["org_id"]).replace("-", "")[:8]
                conn.close()
                return {
                    "org_id": str(row["org_id"]),
                    "token_id": str(row["token_id"]),
                    "token_name": row["name"],
                    "org_slug": row["org_slug"],
                    "org_short": org_short,
                    "permissions": row["permissions"],
                }
        conn.close()
    except Exception as e:
        logger.error(f"Token validation error: {e}")
    return None


def register_device_heartbeat(org_id: str, device_id: str, device_name: str = "",
                               token_id: str = "", metadata: dict = None):
    """Update device last_seen timestamp. Creates device record if new."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO org_devices (org_id, device_id, name, token_id, status, last_seen_at, metadata)
                VALUES (%s, %s, %s, %s, 'online', NOW(), %s)
                ON CONFLICT (org_id, device_id) DO UPDATE SET
                    last_seen_at = NOW(),
                    status = 'online',
                    message_count = org_devices.message_count + 1,
                    metadata = COALESCE(EXCLUDED.metadata, org_devices.metadata)
            """, [org_id, device_id, device_name or device_id, token_id or None,
                  psycopg2.extras.Json(metadata or {})])
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Device heartbeat error: {e}")


def get_org_devices(org_id: str) -> list:
    """Get all devices for an org with status."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Mark devices as offline if no heartbeat in 60s
            cur.execute("""
                UPDATE org_devices SET status = 'offline'
                WHERE org_id = %s AND status = 'online'
                AND last_seen_at < NOW() - INTERVAL '60 seconds'
            """, [org_id])
            conn.commit()

            cur.execute("""
                SELECT d.*, t.name as token_name
                FROM org_devices d
                LEFT JOIN channel_tokens t ON d.token_id = t.id::text
                WHERE d.org_id = %s
                ORDER BY d.last_seen_at DESC NULLS LAST
            """, [org_id])
            devices = cur.fetchall()
        conn.close()
        return devices
    except Exception as e:
        logger.error(f"Get devices error: {e}")
        return []
