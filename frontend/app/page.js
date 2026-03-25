"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);

  useEffect(() => {
    fetch("/api/init").catch(() => {});
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => { window.location.href = "/login"; });
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = () => {
    fetch("/api/pipeline/summary").then((r) => r.json()).then(setSummary);
    fetch("/api/pipeline/query").then((r) => r.json()).then(setData);
  };

  const sendTestData = async () => {
    const now = new Date().toISOString();
    const res = await fetch("/api/pipeline/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          { device_id: "sensor-01", timestamp: now, value: 25 + Math.random() * 10, metric: "temperature" },
          { device_id: "sensor-01", timestamp: now, value: 50 + Math.random() * 30, metric: "humidity" },
        ],
      }),
    });
    const result = await res.json();
    setIngestResult(result);
    loadData();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <div style={{ padding: 40, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>IoT Stack Dashboard</h1>
        <div>
          <span style={{ marginRight: 16, color: "#666" }}>
            {user.username} ({user.role})
          </span>
          {user.role === "admin" && (
            <a href="/admin" style={{ marginRight: 16, color: "#0070f3" }}>Admin</a>
          )}
          <button onClick={handleLogout} style={btnGray}>Logout</button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && summary.aggregated && (
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          {Object.entries(summary.aggregated).map(([key, val]) => (
            <div key={key} style={cardStyle}>
              <div style={{ fontSize: 13, color: "#666", textTransform: "uppercase" }}>{key}</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {val != null ? (typeof val === "number" ? val.toFixed(1) : val) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={sendTestData} style={btnBlue}>Send Test Data</button>
        <button onClick={loadData} style={btnGray}>Refresh</button>
        {ingestResult && (
          <span style={{ color: ingestResult.ok ? "#38a169" : "#e53e3e", fontSize: 14 }}>
            {ingestResult.ok
              ? `✓ ${ingestResult.validated} records ingested`
              : `✗ ${ingestResult.errors[0]}`}
          </span>
        )}
      </div>

      {/* Data Table */}
      {data && data.data && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
          <thead>
            <tr>
              {["Timestamp", "Device", "Metric", "Value"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, i) => (
              <tr key={i}>
                <td style={tdStyle}>{row.timestamp}</td>
                <td style={tdStyle}>{row.device_id}</td>
                <td style={tdStyle}>{row.metric}</td>
                <td style={tdStyle}>{typeof row.value === "number" ? row.value.toFixed(2) : row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pipeline Info */}
      <div style={{ marginTop: 32, padding: 20, background: "#f7f7f7", borderRadius: 8 }}>
        <h3 style={{ margin: "0 0 8px" }}>Block Pipelines</h3>
        <code style={{ fontSize: 13, color: "#555" }}>
          INGEST: Validate → Transform → Store<br />
          QUERY: Query → Aggregate → Format(json)<br />
          SUMMARY: Query → Aggregate → Format(summary)<br />
        </code>
      </div>
    </div>
  );
}

const btnBlue = { padding: "10px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnGray = { padding: "10px 20px", background: "#666", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const cardStyle = { flex: 1, padding: 20, background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" };
const thStyle = { border: "1px solid #ddd", padding: 10, background: "#f5f5f5", textAlign: "left" };
const tdStyle = { border: "1px solid #ddd", padding: 10 };
