"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../lib/user-context.js";

export default function Dashboard() {
  const { user, org } = useUser();
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);

  useEffect(() => {
    fetch("/api/init").catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = () => {
    fetch("/api/pipeline/summary").then((r) => r.json()).then(setSummary).catch(() => {});
    fetch("/api/pipeline/query").then((r) => r.json()).then(setData).catch(() => {});
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

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 4px" }}>Dashboard</h1>
      {org && <p style={{ color: "#666", margin: "0 0 24px" }}>{org.name} — {org.plan} plan</p>}

      {summary && summary.aggregated && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {Object.entries(summary.aggregated).map(([key, val]) => (
            <div key={key} style={cardStyle}>
              <div style={{ fontSize: 13, color: "#666", textTransform: "uppercase" }}>{key}</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {val != null ? (typeof val === "number" ? val.toFixed(1) : val) : "\u2014"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <button onClick={sendTestData} style={btnBlue}>Send Test Data</button>
        <button onClick={loadData} style={btnGray}>Refresh</button>
        {ingestResult && (
          <span style={{ color: ingestResult.ok ? "#38a169" : "#e53e3e", fontSize: 14 }}>
            {ingestResult.ok
              ? `${ingestResult.validated} records ingested`
              : ingestResult.errors?.[0] || "Error"}
          </span>
        )}
      </div>

      {data && data.data && data.data.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
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

      <div style={{ padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 8px" }}>Block Pipelines</h3>
        <code style={{ fontSize: 13, color: "#555" }}>
          INGEST: Validate &rarr; Transform &rarr; Store<br />
          QUERY: Query &rarr; Aggregate &rarr; Format(json)<br />
          SUMMARY: Query &rarr; Aggregate &rarr; Format(summary)<br />
        </code>
      </div>
    </div>
  );
}

const btnBlue = { padding: "10px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnGray = { padding: "10px 20px", background: "#666", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const cardStyle = { flex: 1, padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" };
const thStyle = { border: "1px solid #ddd", padding: 10, background: "#f5f5f5", textAlign: "left" };
const tdStyle = { border: "1px solid #ddd", padding: 10 };
