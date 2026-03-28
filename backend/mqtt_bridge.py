"""
MQTT Bridge — subscribes to Mosquitto broker, forwards messages to channel system.

Supports:
- JSON payloads (auto-parsed)
- Protobuf payloads (decoded via schema registry)
- Binary payloads (base64 encoded)

Topic mapping: MQTT topic "org/{org_short}/sensors/temp" → channel "sensors/temp"
"""

import asyncio
import json
import logging
import os
import base64
import struct
from datetime import datetime, timezone

logger = logging.getLogger("mqtt_bridge")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [mqtt] %(message)s"))
logger.addHandler(handler)

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# Simple protobuf-like decoder for sensor data
# Format: SensorData { float temperature, float humidity, float pressure, uint32 timestamp }
# Packed as: 4 floats + 1 uint32 = 20 bytes
SENSOR_STRUCT = struct.Struct("<fffI")  # little-endian: 3 floats + 1 uint32


def decode_sensor_protobuf(payload: bytes) -> dict | None:
    """Decode binary sensor data (simple packed struct).
    For real protobuf, use generated proto classes."""
    try:
        if len(payload) >= SENSOR_STRUCT.size:
            temp, hum, pres, ts = SENSOR_STRUCT.unpack_from(payload)
            return {
                "temperature": round(temp, 2),
                "humidity": round(hum, 2),
                "pressure": round(pres, 2),
                "timestamp": ts,
                "_decoded": "protobuf",
            }
    except Exception:
        pass
    return None


def decode_payload(payload: bytes) -> dict:
    """Try to decode MQTT payload: JSON first, then protobuf, then raw."""
    # Try JSON
    try:
        return json.loads(payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass

    # Try protobuf/binary struct
    decoded = decode_sensor_protobuf(payload)
    if decoded:
        return decoded

    # Fallback: base64 raw
    return {"_raw": base64.b64encode(payload).decode(), "_format": "binary"}


def parse_topic(topic: str) -> tuple[str | None, str | None]:
    """Parse MQTT topic: org/{org_short}/channel/path → (org_short, channel_name)"""
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

    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://iot:iot123@db:5432/iotstack")

    # Map org_short → org_id
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

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
            # Subscribe to all org topics
            client.subscribe("org/#")
            logger.info("Subscribed to org/#")
        else:
            logger.error(f"MQTT connect failed: rc={rc}")

    def on_message(client, userdata, msg):
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

            # Bridge to channel system (fire-and-forget async)
            asyncio.run_coroutine_threadsafe(ch.publish(org_id, channel_name, data), loop)
            logger.debug(f"Bridged: {msg.topic} → {channel_name} ({len(msg.payload)} bytes)")

        except Exception as e:
            logger.error(f"Bridge error: {e}")

    # Connect to MQTT broker with retry
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id="iot-stack-bridge")
    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            logger.info("MQTT bridge started")
            # Keep running
            while True:
                await asyncio.sleep(60)
        except Exception as e:
            logger.warning(f"MQTT connection failed: {e}, retrying in 10s...")
            await asyncio.sleep(10)


def encode_sensor_protobuf(temperature: float, humidity: float, pressure: float, timestamp: int = 0) -> bytes:
    """Encode sensor data to binary protobuf format (for testing)."""
    if timestamp == 0:
        timestamp = int(datetime.now(timezone.utc).timestamp())
    return SENSOR_STRUCT.pack(temperature, humidity, pressure, timestamp)
