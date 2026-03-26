"use client";

// Published dashboard viewer — short URL /d/[slug]
// Resolves slug to dashboard ID and renders it

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";

export default function DashboardBySlug() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [widgetData, setWidgetData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboards")
      .then((r) => r.ok ? r.json() : { dashboards: [] })
      .then((d) => {
        const found = (d.dashboards || []).find((db) => db.slug === params.slug);
        if (!found) { setError("Dashboard not found"); setLoading(false); return; }
        // Load full dashboard
        return fetch(`/api/dashboards/${found.id}`).then((r) => r.json());
      })
      .then((d) => {
        if (d?.dashboard) {
          setDashboard(d.dashboard);
          loadWidgets(d.dashboard.widgets || []);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [params.slug]);

  const loadWidgets = async (widgets) => {
    const w = typeof widgets === "string" ? JSON.parse(widgets) : widgets;
    const data = {};
    for (let i = 0; i < w.length; i++) {
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w[i] }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData(data);
  };

  if (!user || loading) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;
  if (error) return <div style={{ padding: 32, color: "#e53e3e" }}>{error}</div>;
  if (!dashboard) return null;

  // Reuse the dashboard viewer from /-/dashboards/[id]
  // For now, simple render
  const widgets = typeof dashboard.widgets === "string" ? JSON.parse(dashboard.widgets) : (dashboard.widgets || []);
  const layout = typeof dashboard.layout === "string" ? JSON.parse(dashboard.layout) : (dashboard.layout || {});

  return (
    <div>
      <h1 style={{ margin: "0 0 16px" }}>{dashboard.name}</h1>
      {dashboard.description && <p style={{ color: "#666", fontSize: 13, margin: "-8px 0 16px" }}>{dashboard.description}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 16 }}>
        {widgets.map((w, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, gridColumn: w.width === "full" ? "1 / -1" : "auto" }}>
            <SimpleWidget widget={w} data={widgetData[i]?.data} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleWidget({ widget, data }) {
  if (!data) return <div style={{ color: "#999", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 13 }}>{data.error}</div>;
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
        <thead><tr>{(data.columns || []).map((c) => <th key={c} style={{ border: "1px solid #eee", padding: 4, background: "#f9fafb" }}>{c}</th>)}</tr></thead>
        <tbody>{(data.rows || []).slice(0, 20).map((r, i) => <tr key={i}>{(data.columns || []).map((c) => <td key={c} style={{ border: "1px solid #eee", padding: 4 }}>{r[c] != null ? String(r[c]) : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (["bar", "line"].includes(type) && data.values) {
    const max = Math.max(...data.values, 1);
    const h = 140;
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
        <svg width="100%" height={h + 30} viewBox={`0 0 ${Math.max(data.values.length * 50, 200)} ${h + 30}`}>
          {data.values.map((v, i) => (
            <g key={i}>
              <rect x={i * 50 + 5} y={h - (v / max) * h} width={40} height={(v / max) * h} fill="#0070f3" rx={3} />
              <text x={i * 50 + 25} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels?.[i] || "").slice(0, 8)}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  }
  return <div style={{ color: "#999", fontSize: 13 }}>Widget: {type}</div>;
}
