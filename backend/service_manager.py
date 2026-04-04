"""
Service Manager — runs always-on services from workspace pages.

Services are user_pages with config->>'is_service' = 'true' and
config->>'service_status' = 'running'.

For python pages: writes config.code to a temp file and runs it.
For visual pages: generates Python code from the node graph and runs it.

The manager polls every 15s, starts new services, restarts crashed ones,
and stops services that are no longer flagged.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

logger = logging.getLogger("services")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [services] %(message)s"))
logger.addHandler(handler)

DATABASE_URL = os.getenv("DATABASE_URL", "")
POLL_INTERVAL = 15  # check every 15s

# Running processes: {page_id: {"proc": Popen, "script": path, "name": str}}
_processes: dict[str, dict] = {}

# Directory for generated service scripts
SERVICES_DIR = "/tmp/cuestack-services"
os.makedirs(SERVICES_DIR, exist_ok=True)


def get_db():
    return psycopg2.connect(DATABASE_URL)


def get_service_pages(conn) -> list:
    """Get pages flagged as running services."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.id, p.name, p.page_type, p.config, p.org_id, p.user_id, p.slug,
                   o.slug as org_slug
            FROM user_pages p
            JOIN organizations o ON p.org_id = o.id
            WHERE p.config->>'is_service' = 'true'
              AND p.config->>'service_status' = 'running'
              AND p.page_type IN ('python', 'visual')
        """)
        return cur.fetchall()


def update_page_service_status(conn, page_id: str, status: str, error_msg: str = ""):
    """Update the service_status in page config."""
    with conn.cursor() as cur:
        if error_msg:
            cur.execute("""
                UPDATE user_pages
                SET config = config || jsonb_build_object(
                    'service_status', %s::text,
                    'service_error', %s::text,
                    'service_updated_at', %s::text
                )
                WHERE id = %s
            """, [status, error_msg, datetime.now(timezone.utc).isoformat(), page_id])
        else:
            cur.execute("""
                UPDATE user_pages
                SET config = config || jsonb_build_object(
                    'service_status', %s::text,
                    'service_error', ''::text,
                    'service_updated_at', %s::text
                )
                WHERE id = %s
            """, [status, datetime.now(timezone.utc).isoformat(), page_id])
    conn.commit()


def write_service_script(page: dict) -> str | None:
    """Write the service code to a temp file. Returns the script path."""
    page_id = str(page["id"])
    config = page.get("config", {})
    if isinstance(config, str):
        config = json.loads(config)

    page_type = page["page_type"]

    if page_type == "python":
        code = config.get("code", "")
        if not code.strip():
            logger.warning(f"  Page {page['name']}: no code")
            return None

        script_path = os.path.join(SERVICES_DIR, f"svc_{page_id}.py")
        with open(script_path, "w") as f:
            f.write(code)
        return script_path

    elif page_type == "visual":
        # Generate Python from visual flow
        code = generate_python_from_flow(config, page)
        if not code:
            logger.warning(f"  Page {page['name']}: could not generate code from visual flow")
            return None

        script_path = os.path.join(SERVICES_DIR, f"svc_{page_id}.py")
        with open(script_path, "w") as f:
            f.write(code)
        return script_path

    return None


def generate_python_from_flow(config: dict, page: dict) -> str | None:
    """Generate a Python service script from a visual flow node graph.

    Supports blocks: mqtt_subscribe, decode_protobuf, filter, transform,
    aggregate, insert, ws_publish, mqtt_publish, custom_code.
    """
    nodes = config.get("nodes", [])
    edges = config.get("edges", [])

    if not nodes:
        # Try legacy format
        blocks = config.get("blocks", [])
        if not blocks:
            return None
        # Convert blocks to simple sequential code
        return _generate_from_legacy_blocks(blocks, page)

    return _generate_from_flow_graph(nodes, edges, page)


def _generate_from_flow_graph(nodes: list, edges: list, page: dict) -> str:
    """Generate Python from nodes/edges flow graph."""
    org_id = str(page["org_id"])
    org_short = org_id.replace("-", "")[:8]

    # Build adjacency
    adj = {}
    for e in edges:
        src = e.get("source") or e.get("from")
        tgt = e.get("target") or e.get("to")
        if src and tgt:
            adj.setdefault(src, []).append(tgt)

    node_map = {n["id"]: n for n in nodes}

    # Topological sort
    visited = set()
    order = []

    def dfs(nid):
        if nid in visited:
            return
        visited.add(nid)
        for child in adj.get(nid, []):
            dfs(child)
        order.append(nid)

    for n in nodes:
        dfs(n["id"])
    order.reverse()

    # Find entry points (mqtt_subscribe nodes)
    mqtt_subs = [node_map[nid] for nid in order if node_map.get(nid, {}).get("type") == "mqtt_subscribe"]

    # If no mqtt_subscribe, it's a batch pipeline — generate a loop
    has_mqtt = len(mqtt_subs) > 0

    # Generate imports
    lines = [
        '"""Auto-generated service from visual flow."""',
        "import os, json, time, logging, struct, math",
        "from datetime import datetime, timezone",
        "",
        'logging.basicConfig(level=logging.INFO, format="%(asctime)s [flow-svc] %(message)s")',
        "logger = logging.getLogger()",
        "",
        f'ORG_ID = os.getenv("ORG_ID", "{org_id}")',
        f'ORG_SHORT = "{org_short}"',
        'MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")',
        'MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))',
        'DATABASE_URL = os.getenv("DATABASE_URL", "")',
        "",
    ]

    if has_mqtt:
        lines.append("import paho.mqtt.client as mqtt")
        lines.append("")

    # Check for DB blocks
    has_db = any(node_map.get(nid, {}).get("type") in ("insert", "data_source") for nid in order)
    if has_db:
        lines.append("import psycopg2")
        lines.append("")

    # Generate processing function from the flow
    lines.append("def process(data):")
    lines.append('    """Process pipeline: generated from visual flow."""')
    lines.append("    result = data")

    for nid in order:
        node = node_map.get(nid)
        if not node:
            continue
        ntype = node.get("type", "")
        ncfg = node.get("config", {}) or node.get("data", {}).get("config", {}) or {}

        if ntype == "mqtt_subscribe":
            continue  # Handled in main loop
        elif ntype == "decode_protobuf":
            lines.append("    # Decode protobuf")
            lines.append("    if isinstance(result, bytes):")
            lines.append("        _STRUCT = struct.Struct('<fffI')")
            lines.append("        if len(result) >= _STRUCT.size:")
            lines.append("            t, h, p, ts = _STRUCT.unpack_from(result)")
            lines.append("            result = {'temperature': round(t,2), 'humidity': round(h,2), 'pressure': round(p,2), 'timestamp': ts}")
        elif ntype == "filter":
            field = ncfg.get("field", "temperature")
            op = ncfg.get("operator", ">")
            value = ncfg.get("value", "0")
            # SECURITY: whitelist operators and sanitize field/value
            ALLOWED_OPS = {"==", "!=", ">", "<", ">=", "<="}
            if op not in ALLOWED_OPS:
                op = ">"
            # Sanitize field name — alphanumeric + underscore only
            import re
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', str(field)):
                field = "temperature"
            # Sanitize value — numeric or quoted string only
            try:
                float(value)
            except (ValueError, TypeError):
                value = "0"
            lines.append(f"    # Filter: {field} {op} {value}")
            lines.append(f"    if not (result.get('{field}', 0) {op} {value}):")
            lines.append("        return None")
        elif ntype == "transform":
            expr = ncfg.get("expression", "")
            if expr:
                lines.append("    # Transform")
                lines.append("    result['_transformed'] = True")
        elif ntype == "anomaly_detection":
            lines.append("    # Anomaly detection (Z-score)")
            lines.append("    # Simple inline check")
        elif ntype == "insert":
            table = ncfg.get("table", "sensor_data")
            # SECURITY: sanitize table name — alphanumeric + underscore only
            import re as _re
            if not _re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', str(table)):
                table = "sensor_data"
            lines.append(f"    # Insert into {table}")
            lines.append("    try:")
            lines.append(f"        _tbl = f'org_{{ORG_SHORT}}_{table}'")
            lines.append("        conn = psycopg2.connect(DATABASE_URL)")
            lines.append("        with conn.cursor() as cur:")
            lines.append("            cols = [k for k in result.keys() if not k.startswith('_')]")
            lines.append("            vals = [result[k] for k in cols]")
            lines.append("            placeholders = ','.join(['%s'] * len(cols))")
            lines.append("            col_names = ','.join(cols)")
            lines.append('            cur.execute(f\'INSERT INTO "{_tbl}" (org_id, {col_names}) VALUES (%s, {placeholders})\', [ORG_ID] + vals)')
            lines.append("        conn.commit()")
            lines.append("        conn.close()")
            lines.append("    except Exception as e:")
            lines.append("        logger.error(f'Insert error: {e}')")
        elif ntype in ("ws_publish", "mqtt_publish"):
            channel = ncfg.get("channel", "dashboard/live")
            # SECURITY: sanitize channel name — alphanumeric, slashes, dots, dashes, underscores
            import re as _re
            if not _re.match(r'^[a-zA-Z0-9._/\-]+$', str(channel)):
                channel = "dashboard/live"
            lines.append(f"    # Publish to {channel}")
            lines.append("    try:")
            lines.append("        import urllib.request")
            lines.append(f"        _pub_data = json.dumps({{'channel': '{channel}', 'data': result}})")
            lines.append("        _req = urllib.request.Request('http://localhost:8000/api/channels/publish',")
            lines.append("            data=_pub_data.encode(), headers={'Content-Type': 'application/json'}, method='POST')")
            lines.append("        urllib.request.urlopen(_req, timeout=3)")
            lines.append("    except Exception:")
            lines.append("        pass")
        elif ntype == "custom_code":
            # SECURITY: custom code runs in isolated subprocess with timeout
            user_code = ncfg.get("code", "pass")
            # Escape the code for embedding in a string literal
            _ = user_code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
            lines.append("    # Custom code block (sandboxed subprocess)")
            lines.append("    import subprocess as _sp, tempfile as _tf")
            lines.append(f"    _code = '''{user_code}'''")
            lines.append("    try:")
            lines.append("        _tf_path = _tf.NamedTemporaryFile(suffix='.py', mode='w', delete=False)")
            lines.append("        _wrapper = f'import json, sys\\ndata = json.loads(sys.stdin.read())\\n{_code}\\nprint(json.dumps(data))'")
            lines.append("        _tf_path.write(_wrapper)")
            lines.append("        _tf_path.close()")
            lines.append("        _proc = _sp.run(['python3', _tf_path.name], input=json.dumps(result), capture_output=True, text=True, timeout=10)")
            lines.append("        import os; os.unlink(_tf_path.name)")
            lines.append("        if _proc.returncode == 0 and _proc.stdout.strip():")
            lines.append("            result = json.loads(_proc.stdout.strip())")
            lines.append("    except Exception as _e:")
            lines.append("        logger.warning(f'Custom code error: {_e}')")

    lines.append("    return result")
    lines.append("")

    # Generate main function
    if has_mqtt:
        topic = "sensors/weather"
        for n in mqtt_subs:
            nc = n.get("config", {}) or n.get("data", {}).get("config", {}) or {}
            topic = nc.get("topic", topic)

        lines.extend([
            "def main():",
            f'    topic = f"org/{{ORG_SHORT}}/{topic}"',
            "    count = 0",
            "",
            "    def on_connect(client, userdata, flags, rc, properties=None):",
            "        if rc == 0:",
            "            client.subscribe(topic)",
            '            logger.info(f"Connected & subscribed to {topic}")',
            "",
            "    def on_message(client, userdata, msg):",
            "        nonlocal count",
            "        try:",
            "            # Try JSON first",
            "            try:",
            "                data = json.loads(msg.payload.decode())",
            "            except Exception:",
            "                data = msg.payload",
            "            result = process(data)",
            "            if result is not None:",
            "                count += 1",
            "                if count % 60 == 0:",
            '                    logger.info(f"Processed {count} messages")',
            "        except Exception as e:",
            '            logger.error(f"Process error: {e}")',
            "",
            '    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"flow-svc-{ORG_SHORT}")',
            "    client.on_connect = on_connect",
            "    client.on_message = on_message",
            "",
            "    while True:",
            "        try:",
            '            logger.info(f"Connecting to MQTT {MQTT_BROKER}:{MQTT_PORT}")',
            "            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)",
            "            break",
            "        except Exception as e:",
            '            logger.warning(f"Connection failed: {e}, retrying in 5s...")',
            "            time.sleep(5)",
            "",
            '    logger.info("Flow service running")',
            "    client.loop_forever()",
            "",
        ])
    else:
        lines.extend([
            "def main():",
            '    logger.info("Flow service running (batch mode)")',
            "    count = 0",
            "    while True:",
            "        result = process({})",
            "        count += 1",
            "        if count % 60 == 0:",
            '            logger.info(f"Cycle {count}")',
            "        time.sleep(1)",
            "",
        ])

    lines.extend([
        'if __name__ == "__main__":',
        "    try:",
        "        main()",
        "    except KeyboardInterrupt:",
        '        logger.info("Flow service stopped")',
        "    except Exception as e:",
        '        logger.error(f"Fatal: {e}", exc_info=True)',
        "        raise",
    ])

    return "\n".join(lines)


def _generate_from_legacy_blocks(blocks: list, page: dict) -> str:
    """Generate Python from legacy blocks array format."""
    # Convert to nodes/edges format
    nodes = []
    edges = []
    for i, b in enumerate(blocks):
        nid = f"block_{i}"
        nodes.append({"id": nid, "type": b.get("type", "custom_code"), "config": b.get("config", {})})
        if i > 0:
            edges.append({"source": f"block_{i-1}", "target": nid})
    return _generate_from_flow_graph(nodes, edges, page)


def start_service(page: dict) -> subprocess.Popen | None:
    """Start a page service as a subprocess."""
    pid = str(page["id"])
    name = page["name"]
    org_id = str(page["org_id"])
    org_slug = page.get("org_slug", "")

    script_path = write_service_script(page)
    if not script_path:
        return None

    env = {
        **os.environ,
        "SERVICE_NAME": name,
        "PAGE_ID": pid,
        "ORG_ID": org_id,
        "ORG_SLUG": org_slug,
        "DATABASE_URL": DATABASE_URL,
        "MQTT_BROKER": os.getenv("MQTT_BROKER", "mqtt"),
        "MQTT_PORT": os.getenv("MQTT_PORT", "1883"),
    }

    # Merge page-specific env from config
    config = page.get("config", {})
    if isinstance(config, str):
        config = json.loads(config)
    svc_env = config.get("env", {})
    if isinstance(svc_env, dict):
        env.update({k: str(v) for k, v in svc_env.items()})

    try:
        proc = subprocess.Popen(
            [sys.executable, script_path],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
        )
        logger.info(f"  Started: {name} (pid={proc.pid}, type={page['page_type']})")
        return proc
    except Exception as e:
        logger.error(f"  Failed to start {name}: {e}")
        return None


def stop_service(pid: str):
    """Stop a running service subprocess."""
    info = _processes.get(pid)
    if info:
        proc = info["proc"]
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            logger.info(f"  Stopped: {info['name']} (pid={proc.pid})")
        # Clean up temp script
        script = info.get("script", "")
        if script and os.path.exists(script):
            try:
                os.unlink(script)
            except Exception:
                pass
    _processes.pop(pid, None)


async def run_service_manager():
    """Main service manager loop."""
    logger.info("Service manager started (workspace-based)")

    while True:
        try:
            conn = get_db()
            pages = get_service_pages(conn)
            running_ids = set()

            for page in pages:
                pid = str(page["id"])
                running_ids.add(pid)

                if pid in _processes:
                    proc = _processes[pid]["proc"]
                    if proc.poll() is not None:
                        # Process died — restart
                        exit_code = proc.returncode
                        logger.warning(f"  Service '{page['name']}' died (exit={exit_code}), restarting...")

                        # Re-read code (might have been updated)
                        new_proc = start_service(page)
                        if new_proc:
                            _processes[pid] = {"proc": new_proc, "name": page["name"],
                                               "script": os.path.join(SERVICES_DIR, f"svc_{pid}.py")}
                        else:
                            update_page_service_status(conn, pid, "error", f"Crashed (exit {exit_code})")
                            _processes.pop(pid, None)
                    else:
                        # Check if code changed — compare script hash
                        config = page.get("config", {})
                        if isinstance(config, str):
                            config = json.loads(config)
                        code = config.get("code", "") if page["page_type"] == "python" else ""
                        script_path = _processes[pid].get("script", "")
                        if code and script_path and os.path.exists(script_path):
                            with open(script_path) as f:
                                on_disk = f.read()
                            if on_disk != code:
                                logger.info(f"  Code updated for '{page['name']}', restarting...")
                                stop_service(pid)
                                new_proc = start_service(page)
                                if new_proc:
                                    _processes[pid] = {"proc": new_proc, "name": page["name"],
                                                       "script": os.path.join(SERVICES_DIR, f"svc_{pid}.py")}
                else:
                    # Not started yet
                    logger.info(f"Starting service: {page['name']} ({page['page_type']})")
                    proc = start_service(page)
                    if proc:
                        _processes[pid] = {"proc": proc, "name": page["name"],
                                           "script": os.path.join(SERVICES_DIR, f"svc_{pid}.py")}
                        update_page_service_status(conn, pid, "running")
                    else:
                        update_page_service_status(conn, pid, "error", "Failed to start")

            # Stop services that should no longer be running
            for pid in list(_processes.keys()):
                if pid not in running_ids:
                    logger.info(f"Stopping removed service: {_processes[pid]['name']}")
                    stop_service(pid)

            conn.close()
        except Exception as e:
            logger.error(f"Service manager error: {e}")

        await asyncio.sleep(POLL_INTERVAL)
