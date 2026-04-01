"""
Protobuf codec for CueStack sensor data.

Uses google.protobuf for proper serialization.
Schema: sensor_data.proto (SensorData, DeviceCommand, CommandAck)
"""

import struct
import time


# Since we want to avoid protoc compilation in Docker, we define messages
# using the protobuf runtime directly. This is equivalent to the .proto file.

# --- Manual protobuf encoding/decoding using wire format ---
# This is proper protobuf wire format, NOT packed struct.
# Field numbers match sensor_data.proto

def encode_sensor_data(device_id: str, temperature: float, humidity: float,
                       pressure: float, timestamp: int = 0,
                       extra: dict[str, float] | None = None) -> bytes:
    """Encode SensorData message to protobuf wire format."""
    if timestamp == 0:
        timestamp = int(time.time())

    buf = bytearray()

    # Field 1: device_id (string, wire type 2 = length-delimited)
    if device_id:
        buf += _encode_string(1, device_id)

    # Field 2: temperature (float, wire type 5 = 32-bit)
    buf += _encode_float(2, temperature)

    # Field 3: humidity (float, wire type 5 = 32-bit)
    buf += _encode_float(3, humidity)

    # Field 4: pressure (float, wire type 5 = 32-bit)
    buf += _encode_float(4, pressure)

    # Field 5: timestamp (uint64, wire type 0 = varint)
    buf += _encode_varint_field(5, timestamp)

    # Field 6: extra (map<string, float> -- each entry is a sub-message)
    if extra:
        for k, v in extra.items():
            entry = _encode_string(1, k) + _encode_float(2, v)
            buf += _encode_bytes(6, entry)

    return bytes(buf)


def decode_sensor_data(data: bytes) -> dict | None:
    """Decode SensorData protobuf message."""
    try:
        result = {"device_id": "", "temperature": 0.0, "humidity": 0.0,
                  "pressure": 0.0, "timestamp": 0, "extra": {}}
        pos = 0
        while pos < len(data):
            field_num, wire_type, pos = _decode_key(data, pos)
            if wire_type == 0:  # varint
                value, pos = _decode_varint(data, pos)
                if field_num == 5:
                    result["timestamp"] = value
            elif wire_type == 2:  # length-delimited
                length, pos = _decode_varint(data, pos)
                value = data[pos:pos + length]
                pos += length
                if field_num == 1:
                    result["device_id"] = value.decode("utf-8")
                elif field_num == 6:
                    # Map entry
                    k, v = _decode_map_entry(value)
                    if k:
                        result["extra"][k] = v
            elif wire_type == 5:  # 32-bit (float)
                value = struct.unpack_from("<f", data, pos)[0]
                pos += 4
                if field_num == 2:
                    result["temperature"] = round(value, 2)
                elif field_num == 3:
                    result["humidity"] = round(value, 2)
                elif field_num == 4:
                    result["pressure"] = round(value, 2)
            elif wire_type == 1:  # 64-bit
                pos += 8
            else:
                break

        return result
    except Exception:
        return None


def encode_device_command(command_id: str, command: str, payload: str = "",
                         timestamp: int = 0) -> bytes:
    """Encode DeviceCommand message."""
    if timestamp == 0:
        timestamp = int(time.time())
    buf = bytearray()
    if command_id:
        buf += _encode_string(1, command_id)
    if command:
        buf += _encode_string(2, command)
    if payload:
        buf += _encode_string(3, payload)
    buf += _encode_varint_field(4, timestamp)
    return bytes(buf)


def decode_device_command(data: bytes) -> dict | None:
    """Decode DeviceCommand message."""
    try:
        result = {"command_id": "", "command": "", "payload": "", "timestamp": 0}
        pos = 0
        while pos < len(data):
            field_num, wire_type, pos = _decode_key(data, pos)
            if wire_type == 0:
                value, pos = _decode_varint(data, pos)
                if field_num == 4:
                    result["timestamp"] = value
            elif wire_type == 2:
                length, pos = _decode_varint(data, pos)
                value = data[pos:pos + length].decode("utf-8")
                pos += length
                if field_num == 1:
                    result["command_id"] = value
                elif field_num == 2:
                    result["command"] = value
                elif field_num == 3:
                    result["payload"] = value
            else:
                break
        return result
    except Exception:
        return None


def encode_command_ack(command_id: str, device_name: str, status: str = "ok",
                      message: str = "", timestamp: int = 0) -> bytes:
    """Encode CommandAck message."""
    if timestamp == 0:
        timestamp = int(time.time())
    buf = bytearray()
    if command_id:
        buf += _encode_string(1, command_id)
    if device_name:
        buf += _encode_string(2, device_name)
    if status:
        buf += _encode_string(3, status)
    if message:
        buf += _encode_string(4, message)
    buf += _encode_varint_field(5, timestamp)
    return bytes(buf)


def decode_command_ack(data: bytes) -> dict | None:
    """Decode CommandAck message."""
    try:
        result = {"command_id": "", "device_name": "", "status": "", "message": "", "timestamp": 0}
        pos = 0
        while pos < len(data):
            field_num, wire_type, pos = _decode_key(data, pos)
            if wire_type == 0:
                value, pos = _decode_varint(data, pos)
                if field_num == 5:
                    result["timestamp"] = value
            elif wire_type == 2:
                length, pos = _decode_varint(data, pos)
                value = data[pos:pos + length].decode("utf-8")
                pos += length
                if field_num == 1:
                    result["command_id"] = value
                elif field_num == 2:
                    result["device_name"] = value
                elif field_num == 3:
                    result["status"] = value
                elif field_num == 4:
                    result["message"] = value
            else:
                break
        return result
    except Exception:
        return None


# --- Wire format helpers ---

def _encode_varint(value: int) -> bytes:
    bits = value & 0x7f
    value >>= 7
    result = bytearray()
    while value:
        result.append(0x80 | bits)
        bits = value & 0x7f
        value >>= 7
    result.append(bits)
    return bytes(result)


def _encode_varint_field(field_num: int, value: int) -> bytes:
    key = (field_num << 3) | 0  # wire type 0 = varint
    return _encode_varint(key) + _encode_varint(value)


def _encode_string(field_num: int, value: str) -> bytes:
    encoded = value.encode("utf-8")
    return _encode_bytes(field_num, encoded)


def _encode_bytes(field_num: int, value: bytes) -> bytes:
    key = (field_num << 3) | 2  # wire type 2 = length-delimited
    return _encode_varint(key) + _encode_varint(len(value)) + value


def _encode_float(field_num: int, value: float) -> bytes:
    key = (field_num << 3) | 5  # wire type 5 = 32-bit
    return _encode_varint(key) + struct.pack("<f", value)


def _decode_key(data: bytes, pos: int) -> tuple[int, int, int]:
    key, pos = _decode_varint(data, pos)
    return key >> 3, key & 0x7, pos


def _decode_varint(data: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        result |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, pos


def _decode_map_entry(data: bytes) -> tuple[str, float]:
    """Decode a map<string, float> entry sub-message."""
    key = ""
    value = 0.0
    pos = 0
    while pos < len(data):
        field_num, wire_type, pos = _decode_key(data, pos)
        if wire_type == 2 and field_num == 1:
            length, pos = _decode_varint(data, pos)
            key = data[pos:pos + length].decode("utf-8")
            pos += length
        elif wire_type == 5 and field_num == 2:
            value = round(struct.unpack_from("<f", data, pos)[0], 2)
            pos += 4
        else:
            break
    return key, value
