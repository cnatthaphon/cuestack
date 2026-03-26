"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";

export default function DashboardViewer() {
  const { user } = useUser();
  const params = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [widgetData, setWidgetData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dashboards/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.dashboard) {
          setDashboard(d.dashboard);
          loadWidgetData(d.dashboard.widgets || []);
        }
        setLoading(false);
      });
  }, [params.id]);

  const loadWidgetData = async (widgets) => {
    const data = {};
    for (let i = 0; i < widgets.length; i++) {
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: widgets[i] }),
        });
        data[i] = await res.json();
      } catch {
        data[i] = { data: { error: "Failed to load" } };
      }
    }
    setWidgetData(data);
  };

  if (!user || loading) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;
  if (!dashboard) return <div style={{ padding: 32, color: "#e53e3e" }}>Dashboard not found</div>;

  const widgets = typeof dashboard.widgets === "string" ? JSON.parse(dashboard.widgets) : (dashboard.widgets || []);
  const layout = typeof dashboard.layout === "string" ? JSON.parse(dashboard.layout) : (dashboard.layout || {});
  const cols = layout.columns || 2;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>{dashboard.name}</h1>
        {dashboard.description && <p style={{ color: "#666", fontSize: 13, margin: 0 }}>{dashboard.description}</p>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
        {widgets.map((w, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16,
            gridColumn: w.width === "full" ? "1 / -1" : "auto",
            minHeight: 120,
          }}>
            <WidgetRenderer widget={w} data={widgetData[i]?.data} />
          </div>
        ))}
      </div>

      {widgets.length === 0 && (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          No widgets yet. Edit this dashboard to add widgets.
        </div>
      )}
    </div>
  );
}

function WidgetRenderer({ widget, data }) {
  if (!data) return <div style={{ color: "#999", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 13 }}>{data.error}</div>;

  const { type, config } = widget;

  if (type === "stat") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>{data.label || config?.label || "Value"}</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#1a1a2e" }}>{data.value ?? "\u2014"}</div>
      </div>
    );
  }

  if (type === "text") {
    return <div style={{ fontSize: 14, lineHeight: 1.6 }}>{config?.text || data.text || ""}</div>;
  }

  if (type === "table") {
    const rows = data.rows || [];
    const columns = data.columns || [];
    return (
      <div style={{ overflow: "auto" }}>
        {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{columns.map((c) => <th key={c} style={thStyle}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, config?.max_rows || 20).map((r, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c} style={tdStyle}>{r[c] != null ? String(r[c]) : ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ color: "#999", fontSize: 12, textAlign: "center" }}>No data</p>}
      </div>
    );
  }

  // Chart types — render as simple SVG bar/line chart (no external lib)
  if (["line", "bar", "pie"].includes(type)) {
    const labels = data.labels || [];
    const values = data.values || [];
    if (values.length === 0) return <div style={{ color: "#999", fontSize: 13 }}>No chart data</div>;

    const max = Math.max(...values, 1);
    const h = 160;
    const w = labels.length * 40;

    if (type === "bar") {
      return (
        <div>
          {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
          <svg width="100%" height={h + 30} viewBox={`0 0 ${Math.max(w, 200)} ${h + 30}`} style={{ overflow: "visible" }}>
            {values.map((v, i) => {
              const barH = (v / max) * h;
              const x = i * 40 + 5;
              return (
                <g key={i}>
                  <rect x={x} y={h - barH} width={30} height={barH} fill="#0070f3" rx={3} />
                  <text x={x + 15} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">
                    {String(labels[i]).slice(0, 6)}
                  </text>
                  <text x={x + 15} y={h - barH - 4} textAnchor="middle" fontSize={9} fill="#333">
                    {Math.round(v * 10) / 10}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    if (type === "line") {
      const points = values.map((v, i) => `${i * 40 + 20},${h - (v / max) * h}`).join(" ");
      return (
        <div>
          {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
          <svg width="100%" height={h + 30} viewBox={`0 0 ${Math.max(w, 200)} ${h + 30}`} style={{ overflow: "visible" }}>
            <polyline points={points} fill="none" stroke="#0070f3" strokeWidth={2} />
            {values.map((v, i) => (
              <circle key={i} cx={i * 40 + 20} cy={h - (v / max) * h} r={3} fill="#0070f3" />
            ))}
          </svg>
        </div>
      );
    }

    // Pie — simple CSS
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {values.slice(0, 10).map((v, i) => {
            const total = values.reduce((a, b) => a + b, 0) || 1;
            const pct = Math.round(v / total * 100);
            return (
              <div key={i} style={{ fontSize: 12 }}>
                <div style={{ width: 60, height: 8, background: "#e2e8f0", borderRadius: 4 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: 4 }} />
                </div>
                <span style={{ color: "#666" }}>{labels[i]}: {pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return <div style={{ color: "#999", fontSize: 13 }}>Unknown widget type: {type}</div>;
}

const COLORS = ["#0070f3", "#38a169", "#e53e3e", "#f59e0b", "#7c3aed", "#06b6d4", "#f97316", "#ec4899"];
const thStyle = { border: "1px solid #eee", padding: 6, background: "#f9fafb", textAlign: "left" };
const tdStyle = { border: "1px solid #eee", padding: 6 };
