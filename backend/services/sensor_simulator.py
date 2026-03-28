"""
Sensor Simulator Service — always-on service that simulates an IoT weather station.

Features:
- Authenticates via channel token (validated at startup)
- Publishes protobuf-encoded SensorData to MQTT every second
- Registers as a device in org_devices
- Listens for commands on command topic, responds with ACK (name + datetime)
- Auto-reconnects on connection loss

Topic scheme:
  Publish:  org/{org_short}/sensors/weather     (protobuf SensorData)
  Listen:   org/{org_short}/commands/{device_id} (protobuf DeviceCommand)
  Respond:  org/{org_short}/ack/{device_id}      (protobuf CommandAck)
"""

import os
import sys
import time
import random
import logging
import json
from datetime import datetime, timezone

# Add parent dir so we can import proto_codec and mqtt_auth
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from proto_codec import encode_sensor_data, decode_device_command, encode_command_ack
from mqtt_auth import validate_device_token, register_device_heartbeat

logging.basicConfig(level=logging.INFO, format="%(asctime)s [sensor-sim] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
ORG_ID = os.getenv("ORG_ID", "")
SERVICE_NAME = os.getenv("SERVICE_NAME", "sensor-simulator")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "")
DEVICE_ID = os.getenv("DEVICE_ID", "sim-weather-01")
DEVICE_NAME = os.getenv("DEVICE_NAME", "Bangkok Weather Station")
INTERVAL = float(os.getenv("INTERVAL", "1"))

# Realistic Bangkok weather baseline
BASE_TEMP = 31.0
BASE_HUMIDITY = 72.0
BASE_PRESSURE = 1012.0


class WeatherSimulator:
    """Generates realistic weather readings with smooth transitions."""

    def __init__(self):
        self.temp = BASE_TEMP + random.uniform(-2, 2)
        self.humidity = BASE_HUMIDITY + random.uniform(-5, 5)
        self.pressure = BASE_PRESSURE + random.uniform(-2, 2)
        self.wind_speed = random.uniform(1, 8)
        self.tick = 0

    def next_reading(self) -> dict:
        self.tick += 1
        # Smooth random walk
        self.temp += random.gauss(0, 0.15)
        self.temp = max(24, min(40, self.temp))

        self.humidity += random.gauss(0, 0.3)
        self.humidity = max(40, min(99, self.humidity))

        self.pressure += random.gauss(0, 0.05)
        self.pressure = max(1005, min(1020, self.pressure))

        self.wind_speed += random.gauss(0, 0.2)
        self.wind_speed = max(0, min(25, self.wind_speed))

        return {
            "temperature": round(self.temp, 2),
            "humidity": round(self.humidity, 2),
            "pressure": round(self.pressure, 2),
            "wind_speed": round(self.wind_speed, 2),
        }


def main():
    import paho.mqtt.client as mqtt

    # Validate token at startup
    org_short = ORG_ID.replace("-", "")[:8]
    if DEVICE_TOKEN:
        auth = validate_device_token(DEVICE_TOKEN)
        if auth:
            logger.info(f"Token validated: org={auth['org_slug']}")
            org_short = auth["org_short"]
        else:
            logger.warning("Token validation failed — continuing with ORG_ID")

    topic_data = f"org/{org_short}/sensors/weather"
    topic_cmd = f"org/{org_short}/commands/{DEVICE_ID}"
    topic_ack = f"org/{org_short}/ack/{DEVICE_ID}"

    sim = WeatherSimulator()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{DEVICE_ID}")

    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info(f"Connected to MQTT broker {MQTT_BROKER}:{MQTT_PORT}")
            # Subscribe to command topic
            client.subscribe(topic_cmd)
            logger.info(f"Listening for commands on: {topic_cmd}")
        else:
            logger.error(f"MQTT connect failed: rc={rc}")

    def on_message(client, userdata, msg):
        """Handle incoming commands."""
        try:
            # Try protobuf first
            cmd = decode_device_command(msg.payload)
            if not cmd or not cmd.get("command"):
                # Try JSON fallback
                try:
                    cmd = json.loads(msg.payload.decode())
                except Exception:
                    return

            logger.info(f"Command received: {cmd.get('command')} (id={cmd.get('command_id', 'N/A')})")

            # Send ACK with device name and current datetime
            now = datetime.now(timezone.utc)
            ack_data = encode_command_ack(
                command_id=cmd.get("command_id", ""),
                device_name=DEVICE_NAME,
                status="ok",
                message=f"Executed '{cmd.get('command', '')}' at {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                timestamp=int(now.timestamp()),
            )
            client.publish(topic_ack, ack_data)

            # Also publish JSON ACK for easy debugging
            ack_json = {
                "command_id": cmd.get("command_id", ""),
                "device_name": DEVICE_NAME,
                "device_id": DEVICE_ID,
                "status": "ok",
                "command": cmd.get("command", ""),
                "message": f"Executed at {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                "timestamp": now.isoformat(),
            }
            client.publish(f"org/{org_short}/ack/{DEVICE_ID}_json", json.dumps(ack_json))
            logger.info(f"ACK sent: {ack_json['message']}")

        except Exception as e:
            logger.error(f"Command handler error: {e}")

    client.on_connect = on_connect
    client.on_message = on_message

    # Connect with retry
    while True:
        try:
            logger.info(f"Connecting to MQTT broker {MQTT_BROKER}:{MQTT_PORT}")
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            break
        except Exception as e:
            logger.warning(f"Connection failed: {e}, retrying in 5s...")
            time.sleep(5)

    client.loop_start()
    logger.info(f"Publishing to {topic_data} every {INTERVAL}s (device: {DEVICE_ID})")

    count = 0
    heartbeat_interval = 30  # Register heartbeat every 30 readings

    while True:
        reading = sim.next_reading()
        ts = int(time.time())

        # Encode as protobuf
        payload = encode_sensor_data(
            device_id=DEVICE_ID,
            temperature=reading["temperature"],
            humidity=reading["humidity"],
            pressure=reading["pressure"],
            timestamp=ts,
            extra={"wind_speed": reading["wind_speed"]},
        )
        client.publish(topic_data, payload)
        count += 1

        # Also publish JSON for dashboard/debugging
        json_data = {
            **reading,
            "device_id": DEVICE_ID,
            "timestamp": ts,
            "datetime": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
        }
        client.publish(f"org/{org_short}/sensors/weather_json", json.dumps(json_data))

        # Register device heartbeat periodically
        if count % heartbeat_interval == 1:
            register_device_heartbeat(
                org_id=ORG_ID,
                device_id=DEVICE_ID,
                device_name=DEVICE_NAME,
                token_id=DEVICE_TOKEN[:12] if DEVICE_TOKEN else "",
                metadata={"type": "simulator", "interval": INTERVAL},
            )

        if count % 60 == 0:
            logger.info(f"Published {count} readings (last: {reading['temperature']:.1f}C, "
                        f"{reading['humidity']:.1f}%, {reading['pressure']:.1f}hPa)")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Sensor simulator stopped")
    except Exception as e:
        logger.error(f"Fatal: {e}", exc_info=True)
        raise
