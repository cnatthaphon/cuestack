#!/bin/sh
# Initialize Mosquitto Dynamic Security if not already done
DYNSEC_FILE="/mosquitto/data/dynamic-security.json"

if [ ! -f "$DYNSEC_FILE" ]; then
    echo "Initializing Mosquitto Dynamic Security..."
    mosquitto_ctrl dynsec init "$DYNSEC_FILE" admin "${DYNSEC_ADMIN_PASSWORD:-admin123}"
    echo "Dynsec initialized with admin user"
fi

# Ensure mosquitto user can read the dynsec file (may be created as root)
chown mosquitto:mosquitto "$DYNSEC_FILE" 2>/dev/null || true

exec mosquitto -c /mosquitto/config/mosquitto.conf
