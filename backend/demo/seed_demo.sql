-- =============================================================================
-- IoT Stack Demo Seed Script
-- =============================================================================
-- Creates channels, channel token, services, devices, and HTML app pages
-- for the Demo org. Requires the Demo org and demo user to exist already
-- (created by the frontend seedData() in auth.js).
--
-- Idempotent: uses ON CONFLICT DO NOTHING / DO UPDATE throughout.
-- Requires pgcrypto extension (for digest function).
--
-- Usage:
--   psql -U iot -d iotstack -f seed_demo.sql
--   docker exec -i iot-stack-db-1 psql -U iot -d iotstack < backend/demo/seed_demo.sql
-- =============================================================================

BEGIN;

-- Ensure pgcrypto is available (for SHA-256 hashing)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Resolve demo org and demo user
-- ---------------------------------------------------------------------------
DO $main$
DECLARE
  v_org_id       UUID;
  v_user_id      INTEGER;
  v_token_hash   VARCHAR(255);
  v_svc_sim_id   UUID;
  v_svc_proc_id  UUID;
  v_dashboard_html TEXT;
  v_command_html   TEXT;
BEGIN

  -- Get the Demo org
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'demo';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Demo org not found. Run the frontend seed first.';
  END IF;

  -- Get the demo user (org admin)
  SELECT id INTO v_user_id FROM users WHERE username = 'demo' AND org_id = v_org_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Demo user not found. Run the frontend seed first.';
  END IF;

  RAISE NOTICE 'Demo org: %, demo user: %', v_org_id, v_user_id;

  -- -------------------------------------------------------------------------
  -- 2. Create channels
  -- -------------------------------------------------------------------------
  INSERT INTO org_channels (org_id, name, description, channel_type, created_by)
  VALUES
    (v_org_id, 'sensors/weather',          'Raw protobuf sensor data from weather simulator',       'data',    v_user_id),
    (v_org_id, 'sensors/weather_json',     'JSON-decoded sensor data (decoded by data processor)',   'data',    v_user_id),
    (v_org_id, 'dashboard/live',           'Processed data for live dashboard (with anomaly info)',  'data',    v_user_id),
    (v_org_id, 'commands/sim-weather-01',  'Commands sent to the weather simulator device',          'command', v_user_id),
    (v_org_id, 'ack/sim-weather-01',       'ACK responses from weather simulator (protobuf)',        'command', v_user_id),
    (v_org_id, 'ack/sim-weather-01_json',  'ACK responses from weather simulator (JSON)',            'command', v_user_id)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 3. Create channel token for the sensor simulator
  -- -------------------------------------------------------------------------
  -- Known token: cht_demo_sensor_simulator_000000000000000000000000
  -- Prefix:      cht_demo_sens
  v_token_hash := encode(digest('cht_demo_sensor_simulator_000000000000000000000000', 'sha256'), 'hex');

  IF NOT EXISTS (SELECT 1 FROM channel_tokens WHERE token_hash = v_token_hash) THEN
    INSERT INTO channel_tokens (org_id, name, token_hash, token_prefix, permissions, is_active, created_by)
    VALUES (
      v_org_id,
      'Demo Sensor Simulator',
      v_token_hash,
      'cht_demo_sens',
      '["publish", "subscribe"]'::jsonb,
      true,
      v_user_id
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Create org_services entries
  -- -------------------------------------------------------------------------

  -- Sensor Simulator service
  INSERT INTO org_services (org_id, name, description, entrypoint, status, env, created_by)
  VALUES (
    v_org_id,
    'sensor-simulator',
    'Simulated IoT weather station — publishes protobuf sensor data every second',
    'services/sensor_simulator.py',
    'running',
    jsonb_build_object(
      'DEVICE_TOKEN', 'cht_demo_sensor_simulator_000000000000000000000000',
      'DEVICE_ID',    'sim-weather-01',
      'DEVICE_NAME',  'Bangkok Weather Station',
      'INTERVAL',     '1',
      'MQTT_BROKER',  'mqtt',
      'MQTT_PORT',    '1883'
    ),
    v_user_id
  )
  ON CONFLICT (org_id, name) DO UPDATE SET
    status     = EXCLUDED.status,
    env        = EXCLUDED.env,
    updated_at = NOW()
  RETURNING id INTO v_svc_sim_id;

  -- Data Processor service
  INSERT INTO org_services (org_id, name, description, entrypoint, status, env, created_by)
  VALUES (
    v_org_id,
    'data-processor',
    'Processes sensor data — decodes protobuf, detects anomalies, stores to DB, broadcasts to dashboard',
    'services/data_processor.py',
    'running',
    jsonb_build_object(
      'DEVICE_ID',   'proc-weather-01',
      'MQTT_BROKER', 'mqtt',
      'MQTT_PORT',   '1883'
    ),
    v_user_id
  )
  ON CONFLICT (org_id, name) DO UPDATE SET
    status     = EXCLUDED.status,
    env        = EXCLUDED.env,
    updated_at = NOW()
  RETURNING id INTO v_svc_proc_id;

  -- -------------------------------------------------------------------------
  -- 5. Register demo devices
  -- -------------------------------------------------------------------------
  INSERT INTO org_devices (org_id, device_id, name, device_type, status, metadata)
  VALUES
    (v_org_id, 'sim-weather-01',  'Bangkok Weather Station', 'sensor',    'offline',
     '{"description": "Simulated weather sensor", "location": "Bangkok"}'::jsonb),
    (v_org_id, 'proc-weather-01', 'Weather Data Processor',  'processor', 'offline',
     '{"description": "Processes weather sensor data"}'::jsonb)
  ON CONFLICT (org_id, device_id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 6. Create user_pages entries (HTML apps)
  -- -------------------------------------------------------------------------

  -- Dashboard HTML content
  v_dashboard_html := $dashboard_html$<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #94a3b8; }
  .status .dot { width: 8px; height: 8px; border-radius: 50%; }
  .status .dot.on { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .status .dot.off { background: #ef4444; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .card { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; }
  .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .card .value { font-size: 28px; font-weight: 700; margin: 4px 0; }
  .card .unit { font-size: 14px; color: #64748b; font-weight: 400; }
  .card .sub { font-size: 11px; color: #475569; }
  .card.anomaly { border-color: #ef4444; background: #1c1017; }
  .chart-area { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; margin-bottom: 16px; }
  .chart-title { font-size: 13px; color: #94a3b8; margin-bottom: 8px; }
  canvas { width: 100%; height: 180px; display: block; }
  .log { background: #1e293b; border-radius: 10px; padding: 12px 16px; border: 1px solid #334155; max-height: 150px; overflow-y: auto; }
  .log-entry { padding: 2px 0; font-family: monospace; font-size: 11px; color: #64748b; border-bottom: 1px solid #0f172a; }
  .log-entry .time { color: #475569; }
  .log-entry .data { color: #94a3b8; }
  .log-entry.anomaly { color: #f87171; }
  .readings { font-size: 11px; color: #475569; text-align: right; }
</style>

<div class="header">
  <h1>Live Weather Dashboard</h1>
  <div>
    <div class="status">
      <span class="dot off" id="status-dot"></span>
      <span id="status-text">Connecting...</span>
    </div>
    <div class="readings" id="reading-count">0 readings</div>
  </div>
</div>

<div class="grid">
  <div class="card" id="card-temp">
    <div class="label">Temperature</div>
    <div class="value" id="temp">--<span class="unit">&deg;C</span></div>
    <div class="sub" id="temp-sub">Waiting for data...</div>
  </div>
  <div class="card" id="card-hum">
    <div class="label">Humidity</div>
    <div class="value" id="hum">--<span class="unit">%</span></div>
    <div class="sub" id="hum-sub">Waiting for data...</div>
  </div>
  <div class="card" id="card-pres">
    <div class="label">Pressure</div>
    <div class="value" id="pres">--<span class="unit">hPa</span></div>
    <div class="sub" id="pres-sub">Waiting for data...</div>
  </div>
  <div class="card" id="card-wind">
    <div class="label">Wind Speed</div>
    <div class="value" id="wind">--<span class="unit">m/s</span></div>
    <div class="sub" id="wind-sub">Waiting for data...</div>
  </div>
</div>

<div class="chart-area">
  <div class="chart-title">Temperature &amp; Humidity (last 120 readings)</div>
  <canvas id="chart" height="180"></canvas>
</div>

<div class="chart-area">
  <div class="chart-title">Pressure (last 120 readings)</div>
  <canvas id="chart-pressure" height="120"></canvas>
</div>

<div class="log" id="log"></div>

<script>
const MAX_POINTS = 120;
const tempHistory = [];
const humHistory = [];
const presHistory = [];
let readingCount = 0;
let lastAnomaly = null;

function drawChart(canvasId, datasets, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth * 2;
  const H = canvas.height = (opts.height || 180) * 2;
  ctx.scale(2, 2);
  const w = W / 2, h = H / 2;
  const pad = { top: 10, right: 50, bottom: 20, left: 10 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }

  datasets.forEach(ds => {
    if (ds.data.length < 2) return;
    const min = opts.min !== undefined ? opts.min : Math.min(...ds.data) - 1;
    const max = opts.max !== undefined ? opts.max : Math.max(...ds.data) + 1;
    const range = max - min || 1;

    ctx.strokeStyle = ds.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ds.data.forEach((v, i) => {
      const x = pad.left + (i / (MAX_POINTS - 1)) * plotW;
      const y = pad.top + plotH - ((v - min) / range) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastV = ds.data[ds.data.length - 1];
    const lastY = pad.top + plotH - ((lastV - min) / range) * plotH;
    ctx.fillStyle = ds.color;
    ctx.font = '10px system-ui';
    ctx.fillText(`${lastV.toFixed(1)} ${ds.label}`, w - pad.right + 4, lastY + 3);
  });
}

function addLog(text, isAnomaly) {
  const log = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isAnomaly ? ' anomaly' : '');
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="time">${time}</span> <span class="data">${text}</span>`;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

function updateUI(data) {
  readingCount++;
  document.getElementById('reading-count').textContent = `${readingCount} readings`;

  const temp = data.temperature;
  const hum = data.humidity;
  const pres = data.pressure;
  const wind = data.wind_speed || 0;
  const isAnomaly = data.is_anomaly;

  document.getElementById('temp').innerHTML = `${temp.toFixed(1)}<span class="unit">&deg;C</span>`;
  document.getElementById('hum').innerHTML = `${hum.toFixed(1)}<span class="unit">%</span>`;
  document.getElementById('pres').innerHTML = `${pres.toFixed(1)}<span class="unit">hPa</span>`;
  document.getElementById('wind').innerHTML = `${wind.toFixed(1)}<span class="unit">m/s</span>`;

  const anomaly = data.anomaly || {};
  document.getElementById('temp-sub').textContent = anomaly.temperature ? `z=${anomaly.temperature.z_score}` : '';
  document.getElementById('hum-sub').textContent = anomaly.humidity ? `z=${anomaly.humidity.z_score}` : '';
  document.getElementById('pres-sub').textContent = anomaly.pressure ? `z=${anomaly.pressure.z_score}` : '';
  document.getElementById('wind-sub').textContent = data.device_id || '';

  ['card-temp', 'card-hum', 'card-pres', 'card-wind'].forEach(id => {
    document.getElementById(id).classList.remove('anomaly');
  });
  if (anomaly.temperature?.is_anomaly) document.getElementById('card-temp').classList.add('anomaly');
  if (anomaly.humidity?.is_anomaly) document.getElementById('card-hum').classList.add('anomaly');
  if (anomaly.pressure?.is_anomaly) document.getElementById('card-pres').classList.add('anomaly');

  tempHistory.push(temp);
  humHistory.push(hum);
  presHistory.push(pres);
  if (tempHistory.length > MAX_POINTS) tempHistory.shift();
  if (humHistory.length > MAX_POINTS) humHistory.shift();
  if (presHistory.length > MAX_POINTS) presHistory.shift();

  drawChart('chart', [
    { data: tempHistory, color: '#f59e0b', label: 'C' },
    { data: humHistory, color: '#3b82f6', label: '%' },
  ]);
  drawChart('chart-pressure', [
    { data: presHistory, color: '#8b5cf6', label: 'hPa' },
  ], { height: 120 });

  const logText = `T=${temp.toFixed(1)}C H=${hum.toFixed(1)}% P=${pres.toFixed(1)}hPa W=${wind.toFixed(1)}m/s` +
    (isAnomaly ? ' [ANOMALY]' : '');
  addLog(logText, isAnomaly);
}

async function start() {
  try {
    const sdk = await IoTStack.init();
    document.getElementById('status-dot').className = 'dot on';
    document.getElementById('status-text').textContent = 'Connected';

    sdk.subscribe('dashboard/live', (data) => updateUI(data));
    sdk.subscribe('sensors/weather', (data) => updateUI(data));

    addLog('Connected to live data channels', false);
  } catch (e) {
    document.getElementById('status-text').textContent = 'Error: ' + e.message;
    addLog('Connection error: ' + e.message, true);
  }
}

start();
</script>$dashboard_html$;

  -- Command Center HTML content
  v_command_html := $command_html$<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
  .status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
  .status .dot { width: 8px; height: 8px; border-radius: 50%; }
  .status .dot.on { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .status .dot.off { background: #ef4444; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .panel { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; }
  .panel h2 { font-size: 14px; margin-bottom: 12px; color: #f1f5f9; }
  .cmd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .cmd-btn { padding: 12px; background: #334155; border: 1px solid #475569; border-radius: 8px; color: #e2e8f0; cursor: pointer; font-size: 13px; text-align: left; transition: all 0.15s; }
  .cmd-btn:hover { background: #3b82f6; border-color: #3b82f6; }
  .cmd-btn .icon { font-size: 18px; margin-bottom: 4px; }
  .cmd-btn .name { font-weight: 600; }
  .cmd-btn .desc { font-size: 10px; color: #94a3b8; }
  .cmd-btn:hover .desc { color: #bfdbfe; }
  .custom-cmd { display: flex; gap: 8px; margin-top: 12px; }
  .custom-cmd input { flex: 1; padding: 8px 12px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #e2e8f0; font-family: monospace; font-size: 12px; }
  .custom-cmd button { padding: 8px 16px; background: #3b82f6; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; }
  .custom-cmd button:hover { background: #2563eb; }
  .log { max-height: 400px; overflow-y: auto; }
  .log-entry { padding: 6px 0; border-bottom: 1px solid #0f172a; font-size: 12px; }
  .log-entry .time { color: #475569; font-family: monospace; font-size: 10px; }
  .log-entry .dir { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin: 0 6px; }
  .log-entry .dir.sent { background: #1e3a5f; color: #60a5fa; }
  .log-entry .dir.recv { background: #14532d; color: #4ade80; }
  .log-entry .msg { color: #cbd5e1; }
  .log-entry .device { color: #a78bfa; font-weight: 600; }
  .stats { display: flex; gap: 16px; margin-bottom: 12px; }
  .stat { text-align: center; }
  .stat .num { font-size: 24px; font-weight: 700; }
  .stat .lbl { font-size: 10px; color: #64748b; text-transform: uppercase; }
  .stat .num.sent { color: #60a5fa; }
  .stat .num.recv { color: #4ade80; }
  .stat .num.fail { color: #f87171; }
</style>

<h1>Device Command Center</h1>
<p class="subtitle">Send commands to devices via MQTT. Devices respond with ACK (name + datetime).</p>

<div class="status">
  <span class="dot off" id="status-dot"></span>
  <span id="status-text">Connecting...</span>
</div>

<div class="stats">
  <div class="stat"><div class="num sent" id="sent-count">0</div><div class="lbl">Sent</div></div>
  <div class="stat"><div class="num recv" id="recv-count">0</div><div class="lbl">ACKs</div></div>
  <div class="stat"><div class="num" id="latency" style="color:#f59e0b">--</div><div class="lbl">Avg Latency</div></div>
</div>

<div class="grid">
  <div class="panel">
    <h2>Quick Commands</h2>
    <div class="cmd-grid">
      <div class="cmd-btn" onclick="sendCommand('ping', '')">
        <div class="icon">&#x1F3D3;</div>
        <div class="name">Ping</div>
        <div class="desc">Check if device is alive</div>
      </div>
      <div class="cmd-btn" onclick="sendCommand('status', '')">
        <div class="icon">&#x1F4CA;</div>
        <div class="name">Status</div>
        <div class="desc">Request device status</div>
      </div>
      <div class="cmd-btn" onclick="sendCommand('restart', '')">
        <div class="icon">&#x1F504;</div>
        <div class="name">Restart</div>
        <div class="desc">Restart the service</div>
      </div>
      <div class="cmd-btn" onclick="sendCommand('set_interval', '2')">
        <div class="icon">&#x23F1;</div>
        <div class="name">Set Interval</div>
        <div class="desc">Change to 2s interval</div>
      </div>
      <div class="cmd-btn" onclick="sendCommand('calibrate', '')">
        <div class="icon">&#x1F527;</div>
        <div class="name">Calibrate</div>
        <div class="desc">Run sensor calibration</div>
      </div>
      <div class="cmd-btn" onclick="sendCommand('identify', '')">
        <div class="icon">&#x1F4A1;</div>
        <div class="name">Identify</div>
        <div class="desc">Flash device LED</div>
      </div>
    </div>

    <h2 style="margin-top:16px">Custom Command</h2>
    <div class="custom-cmd">
      <input id="cmd-input" placeholder="Command name..." />
      <input id="payload-input" placeholder="Payload (optional)" />
      <button onclick="sendCustom()">Send</button>
    </div>
  </div>

  <div class="panel">
    <h2>Communication Log</h2>
    <div class="log" id="log"></div>
  </div>
</div>

<script>
let sdk = null;
let sentCount = 0;
let recvCount = 0;
let latencies = [];
let pendingCommands = {};

function genId() {
  return 'cmd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function addLog(direction, text, extra) {
  const log = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const time = new Date().toLocaleTimeString();
  const dirClass = direction === 'sent' ? 'sent' : 'recv';
  const dirLabel = direction === 'sent' ? 'CMD' : 'ACK';
  entry.innerHTML = `<div class="time">${time}</div><span class="dir ${dirClass}">${dirLabel}</span><span class="msg">${text}</span>${extra ? `<div style="font-size:10px;color:#475569;margin-top:2px">${extra}</div>` : ''}`;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 100) log.removeChild(log.lastChild);
}

function updateStats() {
  document.getElementById('sent-count').textContent = sentCount;
  document.getElementById('recv-count').textContent = recvCount;
  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    document.getElementById('latency').textContent = avg < 1000 ? `${Math.round(avg)}ms` : `${(avg / 1000).toFixed(1)}s`;
  }
}

async function sendCommand(command, payload) {
  if (!sdk) return;

  const commandId = genId();
  const sentAt = Date.now();
  pendingCommands[commandId] = { sent_at: sentAt, command };

  const data = {
    command_id: commandId,
    command: command,
    payload: payload || '',
    timestamp: Math.floor(Date.now() / 1000),
  };

  try {
    await sdk.publish('commands/sim-weather-01', data);
    sentCount++;
    addLog('sent', `<strong>${command}</strong>${payload ? ` (${payload})` : ''}`, `ID: ${commandId}`);
    updateStats();
  } catch (e) {
    addLog('sent', `FAILED: ${command} — ${e.message}`, '');
  }
}

function sendCustom() {
  const cmd = document.getElementById('cmd-input').value.trim();
  const payload = document.getElementById('payload-input').value.trim();
  if (!cmd) return;
  sendCommand(cmd, payload);
  document.getElementById('cmd-input').value = '';
  document.getElementById('payload-input').value = '';
}

function handleAck(data) {
  recvCount++;
  const commandId = data.command_id;
  const deviceName = data.device_name || data.device_id || 'Unknown';
  const message = data.message || data.status || 'ok';

  if (pendingCommands[commandId]) {
    const latency = Date.now() - pendingCommands[commandId].sent_at;
    latencies.push(latency);
    if (latencies.length > 50) latencies.shift();
    delete pendingCommands[commandId];
    addLog('recv', `<span class="device">${deviceName}</span>: ${message}`, `Latency: ${latency}ms`);
  } else {
    addLog('recv', `<span class="device">${deviceName}</span>: ${message}`, '');
  }
  updateStats();
}

document.getElementById('cmd-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCustom();
});
document.getElementById('payload-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCustom();
});

async function start() {
  try {
    sdk = await IoTStack.init();
    document.getElementById('status-dot').className = 'dot on';
    document.getElementById('status-text').textContent = 'Connected';

    sdk.subscribe('ack/sim-weather-01', (data) => handleAck(data));
    sdk.subscribe('ack/sim-weather-01_json', (data) => handleAck(data));

    addLog('recv', 'Connected — listening for device ACKs', '');
  } catch (e) {
    document.getElementById('status-text').textContent = 'Error: ' + e.message;
    addLog('recv', 'Connection error: ' + e.message, '');
  }
}

start();
</script>$command_html$;

  -- Live Weather Dashboard app (skip if slug already exists for this user)
  IF NOT EXISTS (SELECT 1 FROM user_pages WHERE org_id = v_org_id AND slug = 'live-weather-dashboard') THEN
    INSERT INTO user_pages (org_id, user_id, name, slug, icon, page_type, entry_type, config, status, visibility, sort_order)
    VALUES (
      v_org_id,
      v_user_id,
      'Live Weather Dashboard',
      'live-weather-dashboard',
      U&'\+01F324',
      'html',
      'page',
      jsonb_build_object('html', v_dashboard_html),
      'published',
      'org',
      1
    );
  END IF;

  -- Device Command Center app (skip if slug already exists for this user)
  IF NOT EXISTS (SELECT 1 FROM user_pages WHERE org_id = v_org_id AND slug = 'device-command-center') THEN
    INSERT INTO user_pages (org_id, user_id, name, slug, icon, page_type, entry_type, config, status, visibility, sort_order)
    VALUES (
      v_org_id,
      v_user_id,
      'Device Command Center',
      'device-command-center',
      U&'\+01F3AE',
      'html',
      'page',
      jsonb_build_object('html', v_command_html),
      'published',
      'org',
      2
    );
  END IF;

  RAISE NOTICE 'Demo seed complete: 6 channels, 1 token, 2 services, 2 devices, 2 HTML apps';

END $main$;

COMMIT;
