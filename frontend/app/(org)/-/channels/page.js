"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateTimeCell } from "../../../../lib/components/data-table.js";

export default function ChannelsPage() {
  const { user, hasPermission } = useUser();
  const [channels, setChannels] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [liveChannel, setLiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [publishData, setPublishData] = useState('{"temperature": 28.5, "humidity": 75}');
  const wsRef = useRef(null);

  useEffect(() => { loadChannels(); return () => { wsRef.current?.close(); }; }, []);

  const loadChannels = async () => {
    const res = await fetch("/api/channels");
    if (res.ok) setChannels((await res.json()).channels || []);
  };

  const createChannel = async (name, description, type) => {
    await fetch("/api/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, channel_type: type }),
    });
    setShowCreate(false);
    loadChannels();
  };

  const deleteChannel = async (id) => {
    if (!confirm("Delete this channel?")) return;
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    loadChannels();
  };

  const createToken = async (name, permissions) => {
    const res = await fetch("/api/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_token", name, permissions }),
    });
    if (res.ok) {
      const d = await res.json();
      setNewToken(d.token);
    }
  };

  // WebSocket live view
  const connectLive = (channelName) => {
    if (wsRef.current) wsRef.current.close();
    setMessages([]);
    setLiveChannel(channelName);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/channels`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "subscribe", channel: channelName }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.channel) {
          setMessages((prev) => [msg, ...prev].slice(0, 50));
        }
      } catch {}
    };
    ws.onclose = () => setLiveChannel(null);
  };

  const publishMessage = () => {
    if (!wsRef.current || !liveChannel) return;
    try {
      const data = JSON.parse(publishData);
      wsRef.current.send(JSON.stringify({ action: "publish", channel: liveChannel, data }));
    } catch {}
  };

  if (!user) return null;

  const columns = [
    { key: "name", label: "Channel", render: (v) => <code style={{ fontSize: 12 }}>{v}</code> },
    { key: "channel_type", label: "Type", render: (v) => <Badge color="#0070f3" bg="#e8f4ff">{v}</Badge> },
    { key: "message_count", label: "Messages", render: (v) => (v || 0).toLocaleString() },
    { key: "last_message_at", label: "Last Message", render: (v) => v ? <DateTimeCell value={v} /> : <span style={{ color: "#ccc" }}>Never</span> },
    { key: "is_active", label: "Status", render: (v) => <Badge color={v ? "#38a169" : "#999"} bg={v ? "#f0fde8" : "#f7f7f7"}>{v ? "Active" : "Inactive"}</Badge> },
    { key: "created_by_name", label: "Created By" },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>Channels</h1>
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
          Real-time data channels for IoT devices and apps. Devices publish via MQTT/WebSocket, apps subscribe for live updates.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={channels}
        searchKeys={["name", "channel_type"]}
        onRowClick={(row) => connectLive(row.name)}
        toolbar={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCreate(true)} style={btnBlue}>+ New Channel</button>
            <button onClick={() => setShowToken(true)} style={btn}>Generate Token</button>
          </div>
        }
        actions={(row) => (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={(e) => { e.stopPropagation(); connectLive(row.name); }} style={{ ...actionBtn, color: "#0070f3" }}>Live</button>
            <button onClick={(e) => { e.stopPropagation(); deleteChannel(row.id); }} style={{ ...actionBtn, color: "#e53e3e" }}>Delete</button>
          </div>
        )}
        emptyMessage="No channels yet. Create one to start receiving real-time data."
      />

      {/* Live view */}
      {liveChannel && (
        <div style={{ marginTop: 16, background: "#1a1a2e", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#fff", fontSize: 13 }}>
              <span style={{ color: "#38a169", marginRight: 8 }}>{"\u25CF"}</span>
              Live: <code style={{ color: "#60a5fa" }}>{liveChannel}</code>
            </div>
            <button onClick={() => { wsRef.current?.close(); setLiveChannel(null); }} style={{ ...actionBtn, color: "#aaa", borderColor: "#444" }}>Disconnect</button>
          </div>
          {/* Publish */}
          <div style={{ padding: "0 16px 10px", display: "flex", gap: 8 }}>
            <input value={publishData} onChange={(e) => setPublishData(e.target.value)}
              style={{ flex: 1, padding: 6, background: "#2a2a4a", border: "1px solid #444", borderRadius: 4, color: "#fff", fontFamily: "monospace", fontSize: 11 }} />
            <button onClick={publishMessage} style={{ padding: "6px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Publish</button>
          </div>
          {/* Messages */}
          <div style={{ maxHeight: 300, overflow: "auto", padding: "0 16px 12px" }}>
            {messages.length === 0 && <div style={{ color: "#555", fontSize: 12, padding: "8px 0" }}>Waiting for messages...</div>}
            {messages.map((m, i) => (
              <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #2a2a4a", fontFamily: "monospace", fontSize: 11, color: "#d4d4d4" }}>
                <span style={{ color: "#666" }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                {" "}
                <span style={{ color: "#60a5fa" }}>{m.channel}</span>
                {" "}
                <span>{JSON.stringify(m.data)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create channel dialog */}
      {showCreate && <CreateChannelDialog onSave={createChannel} onClose={() => setShowCreate(false)} />}

      {/* Token dialog */}
      {showToken && (
        <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Generate Channel Token</h3>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>Tokens authenticate devices/scripts to publish/subscribe to channels.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input id="token-name" placeholder="Token name (e.g., Sensor Gateway)" style={input} />
            <button onClick={() => createToken(document.getElementById("token-name").value || "Device Token", [])} style={btnBlue}>Generate</button>
            <button onClick={() => { setShowToken(false); setNewToken(null); }} style={btn}>Close</button>
          </div>
          {newToken && (
            <div style={{ padding: 12, background: "#f0fde8", borderRadius: 6, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
              <strong>Token (copy now — won't be shown again):</strong><br />{newToken}
            </div>
          )}
        </div>
      )}

      {/* Quick start */}
      <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Quick Start</h3>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 6, fontSize: 11, overflow: "auto", lineHeight: 1.6, margin: 0 }}>
{`// JavaScript (browser app)
const ws = new WebSocket("ws://localhost:8080/ws/channels");
ws.onopen = () => ws.send(JSON.stringify({
  action: "subscribe", channel: "sensors/temp"
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// Publish (HTTP)
fetch("/api/channels/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Channel-Token": "cht_..." },
  body: JSON.stringify({ channel: "sensors/temp", data: { temperature: 28.5 } })
});

// Python (device/script)
import websocket, json
ws = websocket.create_connection("ws://localhost:8080/ws/channels")
ws.send(json.dumps({"action": "subscribe", "channel": "sensors/temp", "token": "cht_..."}))
print(ws.recv())`}
        </pre>
      </div>
    </div>
  );
}

function CreateChannelDialog({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("data");
  return (
    <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #0070f3" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>New Channel</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={{ fontSize: 11, color: "#666" }}>Name (e.g., sensors/temperature)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sensors/temperature" style={input} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#666" }}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
            <option value="data">Data (sensor readings)</option>
            <option value="command">Command (device control)</option>
            <option value="alert">Alert (notifications)</option>
            <option value="status">Status (heartbeat)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#666" }}>Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" style={input} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => name && onSave(name, desc, type)} style={btnBlue}>Create</button>
        <button onClick={onClose} style={btn}>Cancel</button>
      </div>
    </div>
  );
}

const btn = { padding: "6px 14px", background: "#f0f0f0", color: "#333", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const btnBlue = { padding: "6px 14px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const actionBtn = { padding: "2px 8px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: 11 };
const input = { width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
