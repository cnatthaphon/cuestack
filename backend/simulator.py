"""
Sensor simulator — publishes protobuf-encoded sensor data to MQTT.
Runs as a standalone script or called from scheduler.

Simulates a Bangkok weather station sending readings every few seconds.
Data is protobuf-encoded (binary packed struct) to test the decode pipeline.
"""

import os
import time
import random
import json
import struct
import logging

logger = logging.getLogger("simulator")

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# Same struct format as mqtt_bridge.py
SENSOR_STRUCT = struct.Struct("<fffI")  # temp, humidity, pressure, timestamp


def generate_reading():
    """Generate a realistic Bangkok weather reading."""
    return {
        "temperature": round(random.uniform(27, 36), 1),
        "humidity": round(random.uniform(55, 95), 1),
        "pressure": round(random.uniform(1008, 1016), 1),
    }


def encode_protobuf(reading: dict) -> bytes:
    """Encode as binary protobuf (packed struct)."""
    return SENSOR_STRUCT.pack(
        reading["temperature"],
        reading["humidity"],
        reading["pressure"],
        int(time.time()),
    )


def run_simulator(org_short: str, topic: str = "sensors/weather", count: int = 10, interval: float = 2.0, use_protobuf: bool = True):
    """Publish simulated sensor data to MQTT."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        logger.error("paho-mqtt not installed")
        return

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{org_short}")
    full_topic = f"org/{org_short}/{topic}"

    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_start()
        logger.info(f"Simulator connected, publishing to {full_topic}")

        for i in range(count):
            reading = generate_reading()

            if use_protobuf:
                payload = encode_protobuf(reading)
                client.publish(full_topic, payload)
                logger.info(f"  [{i+1}/{count}] protobuf: temp={reading['temperature']}, hum={reading['humidity']} ({len(payload)} bytes)")
            else:
                payload = json.dumps(reading)
                client.publish(full_topic, payload)
                logger.info(f"  [{i+1}/{count}] json: {payload}")

            if i < count - 1:
                time.sleep(interval)

        client.loop_stop()
        client.disconnect()
        logger.info(f"Simulator done: {count} messages to {full_topic}")
        return True

    except Exception as e:
        logger.error(f"Simulator error: {e}")
        return False


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [sim] %(message)s")
    org = sys.argv[1] if len(sys.argv) > 1 else "06ad3a5e"
    topic = sys.argv[2] if len(sys.argv) > 2 else "sensors/weather"
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    run_simulator(org, topic, count)
