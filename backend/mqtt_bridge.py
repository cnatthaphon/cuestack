"""
MQTT Bridge — subscribes to Mosquitto broker, forwards messages to channel system.

Supports:
- Protobuf payloads (SensorData wire format via proto_codec)
- JSON payloads (auto-parsed)
- Binary payloads (base64 encoded fallback)

Topic mapping: MQTT topic "org/{org_short}/sensors/temp" -> channel "sensors/temp"
Also registers device heartbeats in org_devices table.
"""

import asyncio
import json
import logging
import os
import base64
from datetime import datetime, timezone

from proto_codec import decode_sensor_data
from mqtt_auth import register_device_heartbeat

logger = logging.getLogger("mqtt_bridge")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [mqtt] %(message)s"))
logger.addHandler(handler)

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))


def decode_payload(payload: bytes) -> dict:
    """Try to decode MQTT payload: protobuf first, then JSON, then raw."""
    # Try protobuf (SensorData)
    decoded = decode_sensor_data(payload)
    if decoded and (decoded.get("temperature") != 0 or decoded.get("humidity") != 0):
        decoded["_format"] = "protobuf"
        return decoded

    # Try JSON
    try:
        data = json.loads(payload.decode("utf-8"))
        data["_format"] = "json"
        return data
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass

    # Fallback: base64 raw
    return {"_raw": base64.b64encode(payload).decode(), "_format": "binary"}


def parse_topic(topic: str) -> tuple[str | None, str | None]:
    """Parse MQTT topic: org/{org_short}/channel/path -> (org_short, channel_name)"""
    parts = topic.split("/", 2)
    if len(parts) >= 3 and parts[0] == "org":
        return parts[1], "/".join(parts[2:])
    return None, topic


async def run_mqtt_bridge():
    """Connect to MQTT broker and bridge messages to channel system."""
    try:
        import paho.mqtt.client as mqtt_client
    except ImportError:
        logger.error("paho-mqtt not installed, MQTT bridge disabled")
        return

    import channels as ch
    import psycopg2
    import psycopg2.extras

    DATABASE_URL = os.getenv("DATABASE_URL", "")

    # Map org_short -> org_id
    org_cache = {}

    def resolve_org(org_short: str) -> str | None:
        if org_short in org_cache:
            return org_cache[org_short]
        try:
            conn = psycopg2.connect(DATABASE_URL)
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM organizations WHERE id::text LIKE %s", [org_short + "%"])
                row = cur.fetchone()
            conn.close()
            if row:
                org_cache[org_short] = str(row[0])
                return str(row[0])
        except Exception as e:
            logger.error(f"Org resolve error: {e}")
        return None

    loop = asyncio.get_event_loop()
    message_count = 0

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
            client.subscribe("org/#")
            logger.info("Subscribed to org/#")
        else:
            logger.error(f"MQTT connect failed: rc={rc}")

    def on_message(client, userdata, msg):
        nonlocal message_count
        try:
            org_short, channel_name = parse_topic(msg.topic)
            if not org_short or not channel_name:
                return

            org_id = resolve_org(org_short)
            if not org_id:
                return

            data = decode_payload(msg.payload)
            data["_topic"] = msg.topic
            data["_received_at"] = datetime.now(timezone.utc).isoformat()

            # Register device heartbeat if device_id present
            device_id = data.get("device_id")
            if device_id:
                register_device_heartbeat(
                    org_id=org_id,
                    device_id=device_id,
                    device_name=device_id,
                )

            # Bridge to channel system
            asyncio.run_coroutine_threadsafe(ch.publish(org_id, channel_name, data), loop)
            message_count += 1

            if message_count % 60 == 0:
                logger.info(f"Bridged {message_count} messages total")

        except Exception as e:
            logger.error(f"Bridge error: {e}")

    # Connect to MQTT broker with retry (authenticate via dynsec)
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id="cuestack-bridge")
    client.username_pw_set(
        "cuestack-bridge",
        os.getenv("DYNSEC_PASSWORD", "admin123"),
    )
    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            logger.info("MQTT bridge started")
            while True:
                await asyncio.sleep(60)
        except Exception as e:
            logger.warning(f"MQTT connection failed: {e}, retrying in 10s...")
            await asyncio.sleep(10)
