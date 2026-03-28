"""
Data Processor Service — subscribes to MQTT, decodes protobuf, stores in DB, broadcasts to WebSocket.

The full pipeline:
  MQTT (protobuf) → decode → store in weather_bangkok → broadcast to WS channel dashboard/live

Runs continuously as a service.
"""

import os
import json
import struct
import time
import logging
from datetime import datetime, timezone

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s [processor] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://iot:iot123@db:5432/iotstack")
ORG_ID = os.getenv("ORG_ID", "")

# Same struct as simulator
SENSOR_STRUCT = struct.Struct("<fffI")

# WS broadcast via the backend channel system
BACKEND_URL = "http://localhost:8000"


def decode_protobuf(payload: bytes) -> dict | None:
    """Decode binary sensor data."""
    try:
        if len(payload) >= SENSOR_STRUCT.size:
            temp, hum, pres, ts = SENSOR_STRUCT.unpack_from(payload)
            return {
                "temperature": round(temp, 2),
                "humidity": round(hum, 2),
                "pressure": round(pres, 2),
                "timestamp": ts,
            }
    except Exception:
        pass
    return None


def real_table_name(org_id: str, table_name: str) -> str:
    short = org_id.replace("-", "")[:8]
    return f"org_{short}_{table_name}"


def store_reading(conn, org_id: str, reading: dict):
    """Store decoded reading in weather_bangkok table."""
    table = real_table_name(org_id, "weather_bangkok")
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""INSERT INTO "{table}" (org_id, temperature, humidity, pressure, wind_speed, wind_deg,
                    description, feels_like, visibility, clouds)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    org_id,
                    reading["temperature"],
                    reading["humidity"],
                    reading["pressure"],
                    round(reading.get("temperature", 30) * 0.3, 1),  # simulated wind
                    0,
                    "live sensor",
                    round(reading.get("temperature", 30) + 3, 1),  # feels_like
                    10000,
                    20,
                ]
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Store error: {e}")


def broadcast_to_ws(org_id: str, channel: str, data: dict):
    """Broadcast data to WebSocket channel via backend HTTP API."""
    import urllib.request
    try:
        req = urllib.request.Request(
            f"{BACKEND_URL}/api/channels/publish",
            data=json.dumps({"channel": channel, "data": data}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        # No auth needed for internal backend call — TODO: add internal token
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        # Silently fail — WS broadcast is best-effort
        pass


def main():
    import paho.mqtt.client as mqtt

    org_short = ORG_ID.replace("-", "")[:8]
    topic = f"org/{org_short}/sensors/weather"

    conn = psycopg2.connect(DATABASE_URL)
    count = 0
    errors = 0

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            client.subscribe(topic)
            logger.info(f"Connected & subscribed to {topic}")
        else:
            logger.error(f"MQTT connect failed: rc={rc}")

    def on_message(client, userdata, msg):
        nonlocal conn, count, errors
        try:
            # Decode protobuf
            reading = decode_protobuf(msg.payload)
            if not reading:
                # Try JSON fallback
                try:
                    reading = json.loads(msg.payload.decode())
                except Exception:
                    return

            # Store in DB
            store_reading(conn, ORG_ID, reading)
            count += 1

            # Broadcast to WebSocket
            broadcast_data = {
                **reading,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "source": "mqtt",
            }
            broadcast_to_ws(ORG_ID, "sensors/weather", broadcast_data)
            broadcast_to_ws(ORG_ID, "dashboard/live", broadcast_data)

            if count % 12 == 0:
                logger.info(f"Processed {count} readings (errors: {errors}), last: {reading['temperature']}C")

        except psycopg2.OperationalError:
            # Reconnect DB
            try:
                conn = psycopg2.connect(DATABASE_URL)
                logger.info("DB reconnected")
            except Exception:
                pass
            errors += 1
        except Exception as e:
            logger.error(f"Process error: {e}")
            errors += 1

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"proc-{org_short}")
    client.on_connect = on_connect
    client.on_message = on_message

    logger.info(f"Connecting to MQTT {MQTT_BROKER}:{MQTT_PORT}")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

    logger.info("Data processor running — MQTT → decode → DB → WebSocket")
    client.loop_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Data processor stopped")
    except Exception as e:
        logger.error(f"Fatal: {e}")
        raise
