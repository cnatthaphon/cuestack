"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Public dashboard viewer — no login required
// URL: /public/[org-slug]/d/[dashboard-slug]
export default function PublicDashboard() {
  const params = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [widgetData, setWidgetData] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/${params.org}/dashboards/${params.slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Dashboard not found" : "Access denied");
        return r.json();
      })
      .then((d) => {
        setDashboard(d.dashboard);
        loadWidgets(d.dashboard);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.org, params.slug]);

  const loadWidgets = async (dash) => {
    const widgets = typeof dash.widgets === "string" ? JSON.parse(dash.widgets) : (dash.widgets || []);
    const data = {};
    for (let i = 0; i < widgets.length; i++) {
      try {
        const res = await fetch(`/api/public/${params.org}/widget-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: widgets[i] }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData(data);
  };

  if (loading) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#666" }}>Loading...</div>;
  if (error) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#e53e3e" }}>{error}</div>;
  if (!dashboard) return null;

  const widgets = typeof dashboard.widgets === "string" ? JSON.parse(dashboard.widgets) : (dashboard.widgets || []);
  const layout = typeof dashboard.layout === "string" ? JSON.parse(dashboard.layout) : (dashboard.layout || {});

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px" }}>{dashboard.name}</h1>
      {dashboard.description && <p style={{ color: "#666", margin: "0 0 24px" }}>{dashboard.description}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 16 }}>
        {widgets.map((w, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, gridColumn: w.width === "full" ? "1 / -1" : "auto" }}>
            <PublicWidget widget={w} data={widgetData[i]?.data} />
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", color: "#999", fontSize: 12, marginTop: 32 }}>Powered by IoT Stack</p>
    </div>
  );
}

function PublicWidget({ widget, data }) {
  if (!data) return <div style={{ color: "#999" }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e" }}>{data.error}</div>;
  const { type, config } = widget;

  if (type === "stat") return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{data.label}</div>
      <div style={{ fontSize: 36, fontWeight: 700 }}>{data.value ?? "\u2014"}</div>
    </div>
  );
  if (type === "text") return <div style={{ fontSize: 14, lineHeight: 1.6 }}>{config?.text || ""}</div>;
  if (type === "table") return (
    <div style={{ overflow: "auto" }}>
      {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>{(data.columns || []).map((c) => <th key={c} style={{ border: "1px solid #eee", padding: 6, background: "#f9fafb" }}>{c}</th>)}</tr></thead>
        <tbody>{(data.rows || []).slice(0, 20).map((r, i) => <tr key={i}>{(data.columns || []).map((c) => <td key={c} style={{ border: "1px solid #eee", padding: 6 }}>{r[c] != null ? String(r[c]) : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (["bar", "line"].includes(type) && data.values) {
    const max = Math.max(...data.values, 1);
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
        <svg width="100%" height={170} viewBox={`0 0 ${Math.max(data.values.length * 50, 200)} 170`}>
          {data.values.map((v, i) => (
            <g key={i}>
              <rect x={i * 50 + 5} y={140 - (v / max) * 140} width={40} height={(v / max) * 140} fill="#0070f3" rx={3} />
              <text x={i * 50 + 25} y={155} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels?.[i] || "").slice(0, 8)}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  }
  return null;
}
