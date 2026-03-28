"use client";

import { useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

const SECTIONS = [
  {
    id: "python-mqtt",
    title: "Python — MQTT Sensor (Service)",
    tags: ["python", "mqtt", "sensor", "service", "protobuf"],
    desc: "Always-on service that publishes sensor data to MQTT. Create as a Python page and click 'Run as Service'.",
    code: `import os, time, random, json, struct, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [sensor] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
ORG_ID = os.getenv("ORG_ID", "")
DEVICE_ID = "sim-weather-01"
INTERVAL = 1  # seconds

import paho.mqtt.client as mqtt

org_short = ORG_ID.replace("-", "")[:8]
topic = f"org/{org_short}/sensors/weather"

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{DEVICE_ID}")
client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
client.loop_start()

logger.info(f"Publishing to {topic} every {INTERVAL}s")
count = 0
temp, humidity, pressure = 31.0, 72.0, 1012.0

while True:
    # Random walk for realistic readings
    temp += random.gauss(0, 0.15)
    temp = max(24, min(40, temp))
    humidity += random.gauss(0, 0.3)
    humidity = max(40, min(99, humidity))
    pressure += random.gauss(0, 0.05)
    pressure = max(1005, min(1020, pressure))

    data = {
        "device_id": DEVICE_ID,
        "temperature": round(temp, 2),
        "humidity": round(humidity, 2),
        "pressure": round(pressure, 2),
        "timestamp": int(time.time()),
    }
    client.publish(topic, json.dumps(data))
    count += 1

    if count % 60 == 0:
        logger.info(f"Published {count} readings")

    time.sleep(INTERVAL)`,
  },
  {
    id: "python-processor",
    title: "Python — Data Processor (Service)",
    tags: ["python", "mqtt", "processor", "service", "database", "websocket"],
    desc: "Subscribes MQTT, stores in DB, broadcasts to WebSocket. Create as Python page, 'Run as Service'.",
    code: `import os, json, time, logging
from datetime import datetime, timezone

import psycopg2
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO, format="%(asctime)s [proc] %(message)s")
logger = logging.getLogger()

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
ORG_ID = os.getenv("ORG_ID", "")

org_short = ORG_ID.replace("-", "")[:8]
topic = f"org/{org_short}/sensors/weather"
table = f"org_{org_short}_weather_live"

# Create table
conn = psycopg2.connect(DATABASE_URL)
with conn.cursor() as cur:
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS "{table}" (
            id BIGSERIAL PRIMARY KEY,
            org_id UUID, device_id VARCHAR(100),
            temperature FLOAT, humidity FLOAT, pressure FLOAT,
            processed_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
conn.commit()
logger.info(f"Table ready: {table}")

count = 0

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        client.subscribe(topic)
        logger.info(f"Subscribed to {topic}")

def on_message(client, userdata, msg):
    global conn, count
    try:
        data = json.loads(msg.payload.decode())
        with conn.cursor() as cur:
            cur.execute(f'INSERT INTO "{table}" (org_id, device_id, temperature, humidity, pressure) VALUES (%s,%s,%s,%s,%s)',
                [ORG_ID, data.get("device_id",""), data["temperature"], data["humidity"], data["pressure"]])
        conn.commit()
        count += 1

        # Broadcast to WebSocket via MQTT (bridge picks it up)
        processed = {**data, "processed_at": datetime.now(timezone.utc).isoformat(), "source": "processor"}
        client.publish(f"org/{org_short}/dashboard/live", json.dumps(processed))

        if count % 60 == 0:
            logger.info(f"Processed {count} readings")
    except psycopg2.OperationalError:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        logger.error(f"Error: {e}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"proc-{org_short}")
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
logger.info("Data processor running")
client.loop_forever()`,
  },
  {
    id: "html-dashboard",
    title: "HTML — Real-time Dashboard (App)",
    tags: ["html", "javascript", "websocket", "dashboard", "chart", "live"],
    desc: "HTML page that subscribes to WebSocket channel and draws real-time charts. Create as HTML page.",
    code: `<style>
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui; padding: 20px; margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
  .card { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; }
  .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .card .value { font-size: 28px; font-weight: 700; margin: 4px 0; }
  .card .unit { font-size: 14px; color: #64748b; }
  .log { background: #1e293b; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto; }
  .log-entry { font-family: monospace; font-size: 11px; color: #94a3b8; padding: 2px 0; border-bottom: 1px solid #0f172a; }
</style>

<h1 style="font-size:20px; margin-bottom:16px">Live Dashboard</h1>
<div class="grid">
  <div class="card"><div class="label">Temperature</div><div class="value" id="temp">--<span class="unit">&deg;C</span></div></div>
  <div class="card"><div class="label">Humidity</div><div class="value" id="hum">--<span class="unit">%</span></div></div>
  <div class="card"><div class="label">Pressure</div><div class="value" id="pres">--<span class="unit">hPa</span></div></div>
</div>
<div class="log" id="log"></div>

<script>
async function start() {
  const sdk = await IoTStack.init();
  sdk.subscribe('dashboard/live', (data) => {
    document.getElementById('temp').innerHTML = data.temperature.toFixed(1) + '<span class="unit">&deg;C</span>';
    document.getElementById('hum').innerHTML = data.humidity.toFixed(1) + '<span class="unit">%</span>';
    document.getElementById('pres').innerHTML = data.pressure.toFixed(1) + '<span class="unit">hPa</span>';
    const log = document.getElementById('log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = new Date().toLocaleTimeString() + ' T=' + data.temperature.toFixed(1) + ' H=' + data.humidity.toFixed(1) + ' P=' + data.pressure.toFixed(1);
    log.insertBefore(entry, log.firstChild);
    while (log.children.length > 50) log.removeChild(log.lastChild);
  });
}
start();
</script>`,
  },
  {
    id: "html-command",
    title: "HTML — Device Command Center (App)",
    tags: ["html", "javascript", "mqtt", "command", "ack", "two-way"],
    desc: "Send commands to devices and receive ACK responses. Create as HTML page.",
    code: `<style>
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui; padding: 20px; margin: 0; }
  .btn { padding: 10px 20px; background: #334155; border: 1px solid #475569; border-radius: 8px; color: #e2e8f0; cursor: pointer; font-size: 13px; }
  .btn:hover { background: #3b82f6; border-color: #3b82f6; }
  .log { background: #1e293b; border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto; margin-top: 16px; }
  .log-entry { font-family: monospace; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #0f172a; }
  .sent { color: #60a5fa; }
  .recv { color: #4ade80; }
</style>

<h1 style="font-size:20px; margin-bottom:8px">Command Center</h1>
<p style="color:#64748b; font-size:13px; margin-bottom:16px">Send commands to devices. They respond with name + datetime.</p>

<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
  <button class="btn" onclick="send('ping')">Ping</button>
  <button class="btn" onclick="send('status')">Status</button>
  <button class="btn" onclick="send('restart')">Restart</button>
  <button class="btn" onclick="send('calibrate')">Calibrate</button>
</div>
<div style="display:flex; gap:8px">
  <input id="cmd" placeholder="Custom command..." style="flex:1; padding:8px 12px; background:#1e293b; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-family:monospace; font-size:12px" />
  <button class="btn" onclick="send(document.getElementById('cmd').value)">Send</button>
</div>
<div class="log" id="log"></div>

<script>
let sdk;
function log(cls, text) {
  const el = document.getElementById('log');
  const d = document.createElement('div');
  d.className = 'log-entry ' + cls;
  d.textContent = new Date().toLocaleTimeString() + ' ' + text;
  el.insertBefore(d, el.firstChild);
}
async function send(cmd) {
  if (!cmd) return;
  const id = 'cmd_' + Date.now().toString(36);
  await sdk.publish('commands/sim-weather-01', { command_id: id, command: cmd, timestamp: Math.floor(Date.now()/1000) });
  log('sent', 'CMD: ' + cmd + ' (id=' + id + ')');
  document.getElementById('cmd').value = '';
}
async function start() {
  sdk = await IoTStack.init();
  sdk.subscribe('ack/sim-weather-01', (data) => {
    log('recv', 'ACK from ' + data.device_name + ': ' + data.message);
  });
  log('recv', 'Connected — listening for ACKs');
}
start();
</script>`,
  },
  {
    id: "js-subscribe",
    title: "JavaScript SDK — Subscribe to Channel",
    tags: ["javascript", "sdk", "websocket", "subscribe", "real-time"],
    desc: "Use IoTStack.init() and sdk.subscribe() in HTML pages to receive real-time data.",
    code: `// Inside an HTML page — SDK is auto-injected
async function start() {
  const sdk = await IoTStack.init();

  // Subscribe to a channel
  sdk.subscribe('sensors/weather', (data, msg) => {
    console.log('New reading:', data);
    // data = { temperature: 31.2, humidity: 72.1, ... }
  });

  // Subscribe to multiple channels
  sdk.subscribe('dashboard/live', (data) => {
    // Processed data from data processor service
  });
  sdk.subscribe('alerts/critical', (data) => {
    // Alert notifications
  });
}
start();`,
  },
  {
    id: "js-publish",
    title: "JavaScript SDK — Publish to Channel",
    tags: ["javascript", "sdk", "websocket", "publish", "command"],
    desc: "Publish data to channels from HTML apps. Messages are forwarded to MQTT subscribers.",
    code: `// Inside an HTML page — SDK is auto-injected
async function sendCommand() {
  const sdk = await IoTStack.init();

  // Publish a command to a device
  await sdk.publish('commands/my-device', {
    command: 'set_interval',
    payload: '5',
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Publish sensor data manually
  await sdk.publish('sensors/manual', {
    temperature: 25.5,
    humidity: 60,
    source: 'web-app',
  });
}`,
  },
  {
    id: "python-notebook",
    title: "Python SDK — Notebook Helpers",
    tags: ["python", "notebook", "jupyter", "query", "tables", "files"],
    desc: "Pre-injected helpers in Jupyter notebooks. Available automatically when you open a notebook.",
    code: `# These are auto-injected in every notebook:

# List org tables
tables()

# Query data into a DataFrame
df = query("SELECT * FROM sensor_data ORDER BY created_at DESC LIMIT 100")
df.head()

# List files in org storage
files()

# Direct database access
with db.cursor() as cur:
    cur.execute("SELECT count(*) FROM sensor_data")
    print(cur.fetchone())`,
  },
  {
    id: "python-http-publish",
    title: "Python — HTTP Publish (External)",
    tags: ["python", "http", "publish", "external", "token", "curl"],
    desc: "Publish data from external scripts via HTTP API using a channel token.",
    code: `import requests
import json

# Get a channel token from the Channels > Credentials page
TOKEN = "cht_your_token_here"
BASE_URL = "http://your-server:8080"

# Publish data
response = requests.post(
    f"{BASE_URL}/api/channels/publish",
    headers={
        "Content-Type": "application/json",
        "X-Channel-Token": TOKEN,
    },
    json={
        "channel": "sensors/external",
        "data": {
            "temperature": 28.5,
            "source": "external-script",
        },
    },
)
print(response.json())

# Equivalent curl:
# curl -X POST http://your-server:8080/api/channels/publish \\
#   -H "Content-Type: application/json" \\
#   -H "X-Channel-Token: cht_your_token_here" \\
#   -d '{"channel":"sensors/external","data":{"temperature":28.5}}'`,
  },
  {
    id: "env-vars",
    title: "Environment Variables (Services)",
    tags: ["env", "environment", "service", "config", "reference"],
    desc: "Environment variables available in Python service pages.",
    code: `# These are auto-injected into every service:
import os

ORG_ID = os.getenv("ORG_ID")           # UUID of the organization
ORG_SLUG = os.getenv("ORG_SLUG")       # org slug (e.g., "demo")
DATABASE_URL = os.getenv("DATABASE_URL") # PostgreSQL connection string
MQTT_BROKER = os.getenv("MQTT_BROKER")  # MQTT broker hostname (e.g., "mqtt")
MQTT_PORT = os.getenv("MQTT_PORT")      # MQTT port (e.g., "1883")
SERVICE_NAME = os.getenv("SERVICE_NAME") # name of this service
PAGE_ID = os.getenv("PAGE_ID")          # UUID of the page

# Available Python libraries:
# paho-mqtt, psycopg2, numpy, scipy, requests, pandas
# + standard library (json, time, struct, logging, etc.)`,
  },
];

export default function SdkPage() {
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(null);

  if (!user) return null;

  const q = search.toLowerCase().trim();
  const filtered = q
    ? SECTIONS.filter((s) => s.title.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)) || s.desc.toLowerCase().includes(q))
    : SECTIONS;

  const copy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>SDK Documentation</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          Code examples for building on IoT Stack. Copy and paste into your workspace pages.
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search... (e.g., mqtt, dashboard, python, subscribe, service)"
        style={{
          width: "100%", padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: 8,
          fontSize: 14, marginBottom: 20, boxSizing: "border-box",
        }}
      />

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
          No examples match "{search}"
        </div>
      )}

      {filtered.map((s) => (
        <div key={s.id} style={{ marginBottom: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>{s.title}</h3>
              <button onClick={() => copy(s.code, s.id)} style={{
                padding: "4px 12px", background: copied === s.id ? "#22c55e" : "#f1f5f9",
                color: copied === s.id ? "#fff" : "#64748b", border: "none", borderRadius: 4,
                cursor: "pointer", fontSize: 11, fontWeight: 600,
              }}>
                {copied === s.id ? "Copied!" : "Copy"}
              </button>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>{s.desc}</p>
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {s.tags.map((t) => (
                <span key={t} onClick={() => setSearch(t)} style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#f1f5f9",
                  color: "#64748b", cursor: "pointer",
                }}>{t}</span>
              ))}
            </div>
          </div>
          <pre style={{
            margin: 0, padding: 16, background: "#1e1e1e", color: "#d4d4d4",
            fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, overflow: "auto",
            maxHeight: 400,
          }}>{s.code}</pre>
        </div>
      ))}
    </div>
  );
}
