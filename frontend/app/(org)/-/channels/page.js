"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateTimeCell } from "../../../../lib/components/data-table.js";

export default function ChannelsPage() {
  const { user } = useUser();
  const [data, setData] = useState({ channels: [], tokens: [], connection: {} });
  const [tab, setTab] = useState("channels");
  const [showCreate, setShowCreate] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [liveChannel, setLiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [publishData, setPublishData] = useState('{"temperature": 28.5, "humidity": 75}');
  const wsRef = useRef(null);

  useEffect(() => { loadData(); return () => wsRef.current?.close(); }, []);

  const loadData = async () => {
    const res = await fetch("/api/channels");
    if (res.ok) setData(await res.json());
  };

  const createChannel = async (name, description, type) => {
    await fetch("/api/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, channel_type: type }) });
    setShowCreate(false);
    loadData();
  };

  const deleteChannel = async (id) => {
    if (!confirm("Delete this channel?")) return;
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    loadData();
  };

  const createToken = async (name) => {
    const res = await fetch("/api/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_token", name }) });
    if (res.ok) { const d = await res.json(); setNewToken(d.token); loadData(); }
  };

  const deleteToken = async (id) => {
    if (!confirm("Revoke this token?")) return;
    await fetch("/api/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_token", token_id: id }) });
    loadData();
  };

  const connectLive = (channelName) => {
    if (wsRef.current) wsRef.current.close();
    setMessages([]);
    setLiveChannel(channelName);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/channels`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ action: "subscribe", channel: channelName }));
    ws.onmessage = (e) => { try { const msg = JSON.parse(e.data); if (msg.channel) setMessages((p) => [msg, ...p].slice(0, 50)); } catch {} };
    ws.onclose = () => setLiveChannel(null);
  };

  const publishMessage = () => {
    if (!wsRef.current || !liveChannel) return;
    try { wsRef.current.send(JSON.stringify({ action: "publish", channel: liveChannel, data: JSON.parse(publishData) })); } catch {}
  };

  if (!user) return null;
  const conn = data.connection || {};
  const mqtt = conn.mqtt || {};
  const ws = conn.websocket || {};

  const TABS = [
    { id: "channels", label: "Channels" },
    { id: "tokens", label: "Credentials" },
    { id: "connect", label: "Connection Info" },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>Channels</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          Real-time data channels. Devices publish via MQTT, apps subscribe via WebSocket.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === t.id ? "#3b82f6" : "transparent", color: tab === t.id ? "#fff" : "#64748b",
            borderRadius: "6px 6px 0 0",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Channels tab */}
      {tab === "channels" && (
        <>
          <DataTable
            columns={[
              { key: "name", label: "Channel", render: (v) => (
                <div>
                  <code style={{ fontSize: 12, fontWeight: 600 }}>{v}</code>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                    MQTT: {mqtt.topic_prefix}/{v}
                  </div>
                </div>
              )},
              { key: "channel_type", label: "Type", render: (v) => <Badge color={v === "data" ? "#0070f3" : v === "command" ? "#d97706" : v === "alert" ? "#dc2626" : "#059669"} bg={v === "data" ? "#e8f4ff" : v === "command" ? "#fef3c7" : v === "alert" ? "#fef2f2" : "#f0fde8"}>{v}</Badge> },
              { key: "message_count", label: "Messages", render: (v) => (v || 0).toLocaleString() },
              { key: "last_message_at", label: "Last Message", render: (v) => v ? <DateTimeCell value={v} /> : <span style={{ color: "#cbd5e1" }}>—</span> },
            ]}
            data={data.channels}
            searchKeys={["name", "channel_type"]}
            onRowClick={(row) => connectLive(row.name)}
            toolbar={
              <button onClick={() => setShowCreate(true)} style={btnBlue}>+ New Channel</button>
            }
            actions={(row) => (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={(e) => { e.stopPropagation(); connectLive(row.name); }} style={{ ...actionBtn, color: "#3b82f6" }}>Live</button>
                <button onClick={(e) => { e.stopPropagation(); deleteChannel(row.id); }} style={{ ...actionBtn, color: "#ef4444" }}>Delete</button>
              </div>
            )}
            emptyMessage="No channels yet. Create one to start receiving data."
          />

          {showCreate && <CreateChannelDialog onSave={createChannel} onClose={() => setShowCreate(false)} />}

          {/* Live view */}
          {liveChannel && (
            <div style={{ marginTop: 16, background: "#0f172a", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b" }}>
                <div style={{ color: "#f1f5f9", fontSize: 13 }}>
                  <span style={{ color: "#22c55e", marginRight: 8 }}>{"\u25CF"}</span>
                  Live: <code style={{ color: "#60a5fa" }}>{liveChannel}</code>
                  <span style={{ color: "#475569", marginLeft: 8 }}>via WebSocket</span>
                </div>
                <button onClick={() => { wsRef.current?.close(); setLiveChannel(null); }} style={{ padding: "3px 10px", background: "none", border: "1px solid #334155", borderRadius: 4, color: "#94a3b8", cursor: "pointer", fontSize: 11 }}>Disconnect</button>
              </div>
              <div style={{ padding: "8px 16px", display: "flex", gap: 8, borderBottom: "1px solid #1e293b" }}>
                <input value={publishData} onChange={(e) => setPublishData(e.target.value)}
                  style={{ flex: 1, padding: 6, background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#e2e8f0", fontFamily: "monospace", fontSize: 11 }} />
                <button onClick={publishMessage} style={{ padding: "6px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Publish</button>
              </div>
              <div style={{ maxHeight: 250, overflow: "auto", padding: "8px 16px" }}>
                {messages.length === 0 && <div style={{ color: "#475569", fontSize: 12, padding: "8px 0" }}>Waiting for messages...</div>}
                {messages.map((m, i) => (
                  <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid #1e293b", fontFamily: "monospace", fontSize: 11, color: "#cbd5e1" }}>
                    <span style={{ color: "#475569" }}>{new Date(m.timestamp).toLocaleTimeString()}</span>{" "}
                    <span>{JSON.stringify(m.data)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Credentials tab */}
      {tab === "tokens" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              Tokens authenticate devices and apps. Each token = one device/gateway identity.
            </p>
            <button onClick={() => { setShowToken(true); setNewToken(null); }} style={btnBlue}>+ Generate Token</button>
          </div>

          {newToken && (
            <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, border: "2px solid #22c55e", marginBottom: 16 }}>
              <strong style={{ color: "#15803d", fontSize: 13 }}>Token created — copy now, won't be shown again:</strong>
              <div style={{ marginTop: 8, padding: 10, background: "#fff", borderRadius: 6, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <code>{newToken}</code>
                <button onClick={() => navigator.clipboard.writeText(newToken)} style={{ padding: "4px 12px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, flexShrink: 0 }}>Copy</button>
              </div>
            </div>
          )}

          {showToken && !newToken && (
            <div style={{ padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #3b82f6", marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>New Device Token</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="token-name" placeholder="Device name (e.g., Gateway-01, Sensor-Room-A)" style={input} />
                <button onClick={() => createToken(document.getElementById("token-name").value || "Device")} style={btnBlue}>Generate</button>
                <button onClick={() => setShowToken(false)} style={btn}>Cancel</button>
              </div>
            </div>
          )}

          <DataTable
            columns={[
              { key: "name", label: "Device / Gateway", render: (v) => <strong>{v}</strong> },
              { key: "token_prefix", label: "Token", render: (v) => <code style={{ fontSize: 11, color: "#64748b" }}>{v}...</code> },
              { key: "is_active", label: "Status", render: (v) => <Badge color={v ? "#22c55e" : "#ef4444"} bg={v ? "#f0fdf4" : "#fef2f2"}>{v ? "Active" : "Revoked"}</Badge> },
              { key: "created_by_name", label: "Created By" },
              { key: "created_at", label: "Created", render: (v) => <DateTimeCell value={v} /> },
              { key: "last_used_at", label: "Last Used", render: (v) => v ? <DateTimeCell value={v} /> : <span style={{ color: "#cbd5e1" }}>Never</span> },
            ]}
            data={data.tokens}
            searchKeys={["name", "token_prefix"]}
            actions={(row) => (
              <button onClick={() => deleteToken(row.id)} style={{ ...actionBtn, color: "#ef4444" }}>Revoke</button>
            )}
            emptyMessage="No tokens yet. Generate one for each device or gateway."
          />
        </div>
      )}

      {/* Connection Info tab */}
      {tab === "connect" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Organization */}
          <div style={card}>
            <h3 style={cardTitle}>Organization</h3>
            <div style={infoGrid}>
              <span style={infoLabel}>Org ID</span><code style={infoValue}>{conn.org_id}</code>
              <span style={infoLabel}>Org Slug</span><code style={infoValue}>{conn.org_slug}</code>
              <span style={infoLabel}>Org Short</span><code style={infoValue}>{conn.org_short}</code>
            </div>
          </div>

          {/* MQTT */}
          <div style={card}>
            <h3 style={cardTitle}>{"\u{1F4E1}"} MQTT (Devices → Platform)</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Devices publish sensor data here. Binary protobuf or JSON payload.</p>
            <div style={infoGrid}>
              <span style={infoLabel}>Broker</span><code style={infoValue}>{mqtt.broker}:{mqtt.port}</code>
              <span style={infoLabel}>Topic Format</span><code style={infoValue}>{mqtt.topic_prefix}/&lt;channel_name&gt;</code>
              <span style={infoLabel}>Example Topic</span><code style={infoValue}>{mqtt.example_topic}</code>
              <span style={infoLabel}>Auth</span><span style={infoValue}>Anonymous (or token in username field)</span>
              <span style={infoLabel}>Payload</span><span style={infoValue}>JSON or Protobuf (binary)</span>
            </div>
          </div>

          {/* WebSocket */}
          <div style={card}>
            <h3 style={cardTitle}>{"\u{1F50C}"} WebSocket (Platform → Apps)</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Apps subscribe for real-time updates. Authenticate with channel token or session cookie.</p>
            <div style={infoGrid}>
              <span style={infoLabel}>URL</span><code style={infoValue}>{ws.url}</code>
              <span style={infoLabel}>Auth</span><span style={infoValue}>Channel token (<code>cht_...</code>) or session cookie</span>
              <span style={infoLabel}>Subscribe</span><code style={infoValue}>{`{"action":"subscribe","channel":"<name>","token":"cht_..."}`}</code>
              <span style={infoLabel}>Publish</span><code style={infoValue}>{`{"action":"publish","channel":"<name>","data":{...}}`}</code>
            </div>
          </div>

          {/* HTTP */}
          <div style={card}>
            <h3 style={cardTitle}>{"\u{1F310}"} HTTP Publish (Alternative)</h3>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>For devices that can't do MQTT/WebSocket.</p>
            <div style={infoGrid}>
              <span style={infoLabel}>URL</span><code style={infoValue}>POST {conn.http?.publish_url}</code>
              <span style={infoLabel}>Auth Header</span><code style={infoValue}>X-Channel-Token: cht_...</code>
              <span style={infoLabel}>Body</span><code style={infoValue}>{`{"channel":"<name>","data":{...}}`}</code>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            See SDK Documentation for code examples in Python, JavaScript, and curl.
          </p>
        </div>
      )}
    </div>
  );
}

function CreateChannelDialog({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("data");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>New Channel</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={fieldLabel}>Channel Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sensors/temperature" autoFocus style={input} />
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Use slashes for hierarchy. e.g., sensors/room-a/temperature</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabel}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
                <option value="data">Data (sensor readings)</option>
                <option value="command">Command (device control)</option>
                <option value="alert">Alert (notifications)</option>
                <option value="status">Status (heartbeat)</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Description</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" style={input} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn}>Cancel</button>
          <button onClick={() => name && onSave(name, desc, type)} disabled={!name.trim()} style={{ ...btnBlue, opacity: name.trim() ? 1 : 0.5 }}>Create Channel</button>
        </div>
      </div>
    </div>
  );
}

const btn = { padding: "7px 16px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const btnBlue = { padding: "7px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const actionBtn = { padding: "2px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: 4, cursor: "pointer", fontSize: 11 };
const input = { width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, boxSizing: "border-box" };
const fieldLabel = { display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 };
const card = { padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" };
const cardTitle = { margin: "0 0 8px", fontSize: 15 };
const infoGrid = { display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13, marginBottom: 12 };
const infoLabel = { color: "#64748b", fontWeight: 500 };
const infoValue = { color: "#1e293b", wordBreak: "break-all" };
