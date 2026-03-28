"""
Sensor Simulator Service — publishes protobuf-encoded weather data to MQTT every 5 seconds.

Simulates a Bangkok weather station. Runs continuously as a service.
"""

import os
import time
import random
import struct
import logging
import json

logging.basicConfig(level=logging.INFO, format="%(asctime)s [sensor-sim] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
ORG_ID = os.getenv("ORG_ID", "")
ORG_SLUG = os.getenv("ORG_SLUG", "")
INTERVAL = int(os.getenv("INTERVAL", "5"))

# Binary struct: temp(f), humidity(f), pressure(f), timestamp(I)
SENSOR_STRUCT = struct.Struct("<fffI")


def generate_reading():
    return {
        "temperature": round(random.uniform(27, 36), 1),
        "humidity": round(random.uniform(55, 95), 1),
        "pressure": round(random.uniform(1008, 1016), 1),
    }


def main():
    import paho.mqtt.client as mqtt

    org_short = ORG_ID.replace("-", "")[:8]
    topic = f"org/{org_short}/sensors/weather"

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{org_short}")

    logger.info(f"Connecting to MQTT broker {MQTT_BROKER}:{MQTT_PORT}")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    logger.info(f"Publishing to {topic} every {INTERVAL}s")
    count = 0

    while True:
        reading = generate_reading()
        payload = SENSOR_STRUCT.pack(
            reading["temperature"],
            reading["humidity"],
            reading["pressure"],
            int(time.time()),
        )
        client.publish(topic, payload)
        count += 1

        # Also publish JSON version for easy debugging
        client.publish(f"org/{org_short}/sensors/weather_json", json.dumps(reading))

        if count % 12 == 0:  # Log every minute
            logger.info(f"Published {count} readings (last: {reading['temperature']}C, {reading['humidity']}%)")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Sensor simulator stopped")
    except Exception as e:
        logger.error(f"Fatal: {e}")
        raise
