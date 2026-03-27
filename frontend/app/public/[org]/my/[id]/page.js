"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PublicPersonalDashboard() {
  const params = useParams();
  const [dash, setDash] = useState(null);
  const [widgetData, setWidgetData] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/${params.org}/my-dashboard/${params.id}`)
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then((d) => { setDash(d.dashboard); loadWidgets(d.dashboard); })
      .catch((e) => setError(e.message));
  }, [params.org, params.id]);

  const loadWidgets = async (db) => {
    const w = typeof db.widgets === "string" ? JSON.parse(db.widgets) : (db.widgets || []);
    const data = {};
    for (let i = 0; i < w.length; i++) {
      try {
        const res = await fetch(`/api/public/${params.org}/widget-data`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w[i] }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData(data);
  };

  if (error) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#e53e3e" }}>{error}</div>;
  if (!dash) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#666" }}>Loading...</div>;

  const widgets = typeof dash.widgets === "string" ? JSON.parse(dash.widgets) : (dash.widgets || []);
  const layout = typeof dash.layout === "string" ? JSON.parse(dash.layout) : (dash.layout || {});

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px" }}>{dash.icon} {dash.name}</h1>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 16, gridAutoRows: "minmax(120px, auto)" }}>
        {widgets.map((w, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16,
            gridColumn: `span ${w.colSpan || 1}`, gridRow: `span ${w.rowSpan || 1}`,
          }}>
            <PublicWidget widget={w} data={widgetData[i]?.data} />
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", color: "#999", fontSize: 12, marginTop: 32 }}>Powered by IoT Stack</p>
    </div>
  );
}

function PublicWidget({ widget, data }) {
  if (!data) return <div style={{ color: "#ccc" }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{data.error}</div>;
  const { type, config } = widget;
  if (type === "stat") return <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{data.label}</div><div style={{ fontSize: 36, fontWeight: 700 }}>{data.value ?? "\u2014"}</div></div>;
  if (type === "text") return <div style={{ fontSize: 14, lineHeight: 1.6 }}>{config?.text || ""}</div>;
  if (type === "table") return (
    <div style={{ overflow: "auto" }}>
      {config?.title && <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>{config.title}</h3>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr>{(data.columns || []).map((c) => <th key={c} style={{ border: "1px solid #eee", padding: 4, background: "#f9fafb" }}>{c}</th>)}</tr></thead>
        <tbody>{(data.rows || []).slice(0, 20).map((r, i) => <tr key={i}>{(data.columns || []).map((c) => <td key={c} style={{ border: "1px solid #eee", padding: 4 }}>{r[c] != null ? String(r[c]) : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (["bar", "line"].includes(type) && data.values) {
    const max = Math.max(...data.values, 1); const h = 140;
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>{config.title}</h3>}
        <svg width="100%" height={h + 25} viewBox={`0 0 ${Math.max(data.values.length * 50, 200)} ${h + 25}`}>
          {type === "line" ? (
            <polyline points={data.values.map((v, i) => `${i * 50 + 25},${h - (v / max) * h}`).join(" ")} fill="none" stroke="#0070f3" strokeWidth={2} />
          ) : (
            data.values.map((v, i) => <g key={i}><rect x={i * 50 + 5} y={h - (v / max) * h} width={40} height={(v / max) * h} fill="#0070f3" rx={3} /><text x={i * 50 + 25} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels?.[i] || "").slice(0, 8)}</text></g>))
          }
        </svg>
      </div>
    );
  }
  return null;
}
