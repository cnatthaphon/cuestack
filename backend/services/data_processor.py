"""
Data Processor Service — always-on pipeline that processes IoT sensor data.

Pipeline: MQTT subscribe → decode protobuf → anomaly detection → store DB → broadcast WebSocket

Features:
- Subscribes to MQTT sensor topics (protobuf-encoded)
- Decodes SensorData protobuf messages
- Runs Z-score anomaly detection on temperature
- Stores readings in org-scoped weather table
- Broadcasts processed data to WebSocket channel for live dashboards
- Registers as a device (processor) in org_devices
- Auto-reconnects on DB/MQTT connection loss
"""

import json
import logging
import math
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone

import psycopg2

# Add parent dir for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mqtt_auth import register_device_heartbeat
from proto_codec import decode_sensor_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s [processor] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
ORG_ID = os.getenv("ORG_ID", "")
SERVICE_NAME = os.getenv("SERVICE_NAME", "data-processor")
DEVICE_ID = os.getenv("DEVICE_ID", "proc-weather-01")

ANOMALY_WINDOW = 60  # Z-score window size
ANOMALY_THRESHOLD = 2.5  # Z-score threshold


class AnomalyDetector:
    """Rolling Z-score anomaly detection."""

    def __init__(self, window_size: int = 60, threshold: float = 2.5):
        self.window = deque(maxlen=window_size)
        self.threshold = threshold

    def check(self, value: float) -> dict:
        self.window.append(value)
        if len(self.window) < 10:
            return {"is_anomaly": False, "z_score": 0.0, "mean": value, "std": 0.0}

        values = list(self.window)
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std = math.sqrt(variance) if variance > 0 else 0.001

        z_score = (value - mean) / std
        is_anomaly = abs(z_score) > self.threshold

        return {
            "is_anomaly": is_anomaly,
            "z_score": round(z_score, 3),
            "mean": round(mean, 2),
            "std": round(std, 3),
        }


def real_table_name(org_id: str, table_name: str) -> str:
    short = org_id.replace("-", "")[:8]
    return f"org_{short}_{table_name}"


def ensure_table(conn, org_id: str):
    """Create the weather table if it doesn't exist."""
    table = real_table_name(org_id, "weather_live")
    with conn.cursor() as cur:
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS "{table}" (
                id BIGSERIAL PRIMARY KEY,
                org_id UUID NOT NULL,
                device_id VARCHAR(100),
                temperature FLOAT,
                humidity FLOAT,
                pressure FLOAT,
                wind_speed FLOAT,
                is_anomaly BOOLEAN DEFAULT false,
                z_score FLOAT,
                processed_at TIMESTAMPTZ DEFAULT NOW(),
                raw_timestamp BIGINT
            )
        """)
        cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_{table}_ts" ON "{table}" (processed_at DESC)')
    conn.commit()
    logger.info(f"Table ready: {table}")


def store_reading(conn, org_id: str, reading: dict, anomaly: dict):
    """Store processed reading in weather_live table."""
    table = real_table_name(org_id, "weather_live")
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""INSERT INTO "{table}"
                    (org_id, device_id, temperature, humidity, pressure, wind_speed,
                     is_anomaly, z_score, raw_timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    org_id,
                    reading.get("device_id", "unknown"),
                    reading["temperature"],
                    reading["humidity"],
                    reading["pressure"],
                    reading.get("extra", {}).get("wind_speed", 0),
                    anomaly["is_anomaly"],
                    anomaly["z_score"],
                    reading.get("timestamp", 0),
                ]
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e


def broadcast_via_mqtt(mqtt_client, org_short: str, channel: str, data: dict):
    """Broadcast processed data back to MQTT. The bridge will forward to WebSocket subscribers."""
    try:
        topic = f"org/{org_short}/{channel}"
        mqtt_client.publish(topic, json.dumps(data))
    except Exception:
        pass  # Best-effort broadcast


def main():
    import paho.mqtt.client as mqtt

    org_short = ORG_ID.replace("-", "")[:8]
    topic = f"org/{org_short}/sensors/weather"

    # Connect to DB
    conn = psycopg2.connect(DATABASE_URL)
    ensure_table(conn, ORG_ID)

    # Anomaly detectors per metric
    detectors = {
        "temperature": AnomalyDetector(ANOMALY_WINDOW, ANOMALY_THRESHOLD),
        "humidity": AnomalyDetector(ANOMALY_WINDOW, ANOMALY_THRESHOLD),
        "pressure": AnomalyDetector(ANOMALY_WINDOW, 3.0),  # pressure is more stable
    }

    count = 0
    errors = 0
    anomalies = 0

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            client.subscribe(topic)
            # Also subscribe to JSON topic as fallback
            client.subscribe(f"org/{org_short}/sensors/weather_json")
            logger.info(f"Connected & subscribed to {topic}")
        else:
            logger.error(f"MQTT connect failed: rc={rc}")

    def on_message(client, userdata, msg):
        nonlocal conn, count, errors, anomalies
        try:
            # Decode protobuf
            reading = decode_sensor_data(msg.payload)
            if not reading or reading["temperature"] == 0.0:
                # Try JSON fallback
                try:
                    reading = json.loads(msg.payload.decode())
                    reading.setdefault("extra", {})
                except Exception:
                    return

            # Run anomaly detection
            temp_anomaly = detectors["temperature"].check(reading["temperature"])
            hum_anomaly = detectors["humidity"].check(reading["humidity"])
            pres_anomaly = detectors["pressure"].check(reading["pressure"])

            is_anomaly = temp_anomaly["is_anomaly"] or hum_anomaly["is_anomaly"] or pres_anomaly["is_anomaly"]
            if is_anomaly:
                anomalies += 1

            # Store in DB
            try:
                store_reading(conn, ORG_ID, reading, temp_anomaly)
            except psycopg2.OperationalError:
                conn = psycopg2.connect(DATABASE_URL)
                ensure_table(conn, ORG_ID)
                store_reading(conn, ORG_ID, reading, temp_anomaly)

            count += 1

            # Broadcast to WebSocket channels
            now = datetime.now(timezone.utc)
            broadcast_data = {
                "device_id": reading.get("device_id", "unknown"),
                "temperature": reading["temperature"],
                "humidity": reading["humidity"],
                "pressure": reading["pressure"],
                "wind_speed": reading.get("extra", {}).get("wind_speed", 0),
                "anomaly": {
                    "temperature": temp_anomaly,
                    "humidity": hum_anomaly,
                    "pressure": pres_anomaly,
                },
                "is_anomaly": is_anomaly,
                "processed_at": now.isoformat(),
                "reading_count": count,
                "source": "mqtt_protobuf",
            }
            broadcast_via_mqtt(client, org_short, "dashboard/live", broadcast_data)

            # Register heartbeat periodically
            if count % 30 == 1:
                register_device_heartbeat(
                    org_id=ORG_ID,
                    device_id=DEVICE_ID,
                    device_name="Data Processor",
                    metadata={"processed": count, "anomalies": anomalies, "errors": errors},
                )

            if count % 60 == 0:
                logger.info(f"Processed {count} readings (anomalies: {anomalies}, errors: {errors}), "
                            f"last: {reading['temperature']:.1f}C z={temp_anomaly['z_score']:.2f}")

        except Exception as e:
            errors += 1
            if errors % 10 == 1:
                logger.error(f"Process error ({errors} total): {e}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"proc-{org_short}")
    client.on_connect = on_connect
    client.on_message = on_message

    # Connect with retry
    while True:
        try:
            logger.info(f"Connecting to MQTT {MQTT_BROKER}:{MQTT_PORT}")
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            break
        except Exception as e:
            logger.warning(f"Connection failed: {e}, retrying in 5s...")
            time.sleep(5)

    logger.info("Data processor running — MQTT → protobuf decode → anomaly detection → DB → WebSocket")
    client.loop_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Data processor stopped")
    except Exception as e:
        logger.error(f"Fatal: {e}", exc_info=True)
        raise
