"""
Mosquitto Dynamic Security client.

Syncs channel tokens to Mosquitto's built-in ACL system.
When a token is created/deleted in the UI, this module updates Mosquitto
so MQTT connections are immediately allowed/denied.

Mosquitto dynsec uses the $CONTROL topic for management commands.
We send commands via MQTT publish to $CONTROL/dynamic-security/v1.
"""

import json
import logging
import os
import paho.mqtt.client as mqtt_client

logger = logging.getLogger("mqtt_dynsec")

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DYNSEC_ADMIN = os.getenv("DYNSEC_ADMIN", "admin")
DYNSEC_PASSWORD = os.getenv("DYNSEC_PASSWORD", "admin123")

_client = None


def _get_client():
    global _client
    if _client is None or not _client.is_connected():
        _client = mqtt_client.Client(
            callback_api_version=mqtt_client.CallbackAPIVersion.VERSION2,
            client_id="cuestack-dynsec-admin",
        )
        _client.username_pw_set(DYNSEC_ADMIN, DYNSEC_PASSWORD)
        _client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        _client.loop_start()
    return _client


def _send_command(command: dict) -> bool:
    """Send a dynsec command to Mosquitto."""
    try:
        client = _get_client()
        payload = json.dumps({"commands": [command]})
        result = client.publish("$CONTROL/dynamic-security/v1", payload, qos=1)
        result.wait_for_publish(timeout=5)
        return True
    except Exception as e:
        logger.error(f"Dynsec command failed: {e}")
        return False


def create_client(username: str, password: str, client_id: str = ""):
    """Create a new MQTT client in Mosquitto dynsec."""
    return _send_command({
        "command": "createClient",
        "username": username,
        "password": password,
        "clientid": client_id or "",
    })


def delete_client(username: str):
    """Delete an MQTT client — disconnects immediately."""
    return _send_command({
        "command": "deleteClient",
        "username": username,
    })


def set_client_acl(username: str, topics: list, allow_publish: bool = True, allow_subscribe: bool = True):
    """Set ACL for a client — which topics they can read/write.
    Creates a role with the specified ACLs and assigns it to the client."""
    acls = []
    for topic in topics:
        if allow_publish:
            acls.append({"acltype": "publishClientSend", "topic": topic, "allow": True})
        if allow_subscribe:
            acls.append({"acltype": "subscribePattern", "topic": topic, "allow": True})

    role_name = f"role_{username}"

    # Delete old role if exists (ignore error if not found)
    _send_command({"command": "deleteRole", "rolename": role_name})

    # Create role with ACLs
    _send_command({"command": "createRole", "rolename": role_name, "acls": acls})

    # Assign role to client
    _send_command({
        "command": "addClientRole",
        "username": username,
        "rolename": role_name,
    })
    return True


def disconnect_client(username: str):
    """Force disconnect a client by disabling it."""
    return _send_command({
        "command": "disableClient",
        "username": username,
    })


def enable_client(username: str):
    """Re-enable a disabled client."""
    return _send_command({
        "command": "enableClient",
        "username": username,
    })


def sync_token(token_hash_short: str, org_short: str, permissions: list, active: bool = True):
    """Sync a channel token to Mosquitto dynsec.
    Called when token is created, updated, or deleted.

    Args:
        token_hash_short: First 16 chars of token hash, used as MQTT username
        org_short: First 8 chars of org_id (no dashes), for topic prefix
        permissions: List like ["publish", "subscribe"] or ["read", "write"]
        active: If False, deletes the client from Mosquitto
    """
    username = f"cht_{token_hash_short}"
    topic_prefix = f"org/{org_short}/#"

    if not active:
        delete_client(username)
        return

    # Create or update client (password = token_hash_short for device auth)
    create_client(username, token_hash_short)

    # Set ACL based on permissions
    allow_pub = "publish" in permissions or "write" in permissions or not permissions
    allow_sub = "subscribe" in permissions or "read" in permissions or not permissions
    set_client_acl(username, [topic_prefix], allow_publish=allow_pub, allow_subscribe=allow_sub)


def ensure_internal_clients():
    """Create internal service clients (bridge, publisher) if they don't exist.
    Called at backend startup to ensure internal services can authenticate."""
    # Bridge client — subscribes to org/# to forward messages to channel system
    create_client("cuestack-bridge", DYNSEC_PASSWORD)
    set_client_acl("cuestack-bridge", ["org/#", "$SYS/#"], allow_publish=False, allow_subscribe=True)

    # Command publisher — publishes commands from HTTP/WS to MQTT
    create_client("cuestack-cmd-publisher", DYNSEC_PASSWORD)
    set_client_acl("cuestack-cmd-publisher", ["org/#"], allow_publish=True, allow_subscribe=False)
