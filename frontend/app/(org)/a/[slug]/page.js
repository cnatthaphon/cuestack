"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";
import FlowEditor from "./flow-editor.js";

export default function AppViewer() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const slug = params.slug;
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    if (!slug) return;
    // Load app info
    fetch("/api/apps")
      .then((r) => r.ok ? r.json() : { apps: [] })
      .then((d) => {
        const found = (d.apps || []).find((a) => a.slug === slug);
        if (!found) { setError("App not found"); setLoading(false); return; }
        if (found.status !== "published") { setError("App is not published"); setLoading(false); return; }
        if (found.permission_id && !hasPermission(found.permission_id)) {
          setError("You don't have permission to access this app");
          setLoading(false);
          return;
        }
        setApp(found);
        loadAppContent(found);
      });
  }, [slug]);

  const loadAppContent = async (appData) => {
    if (appData.app_type === "html") {
      // Load HTML from files
      try {
        const res = await fetch(`/api/files/download?path=/apps/${appData.slug}/${appData.entrypoint || "index.html"}`);
        if (res.ok) {
          const text = await res.text();
          setHtmlContent(text);
        } else {
          setHtmlContent(getDefaultHtml(appData));
        }
      } catch {
        setHtmlContent(getDefaultHtml(appData));
      }
    } else if (appData.app_type === "visual") {
      // Visual flow apps render from config
      setHtmlContent(""); // handled by visual renderer
    }
    setLoading(false);
  };

  if (!user) return null;

  if (loading) {
    return <div style={{ padding: 32, color: "#666" }}>Loading app...</div>;
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ margin: "0 0 8px" }}>App Error</h1>
        <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#e53e3e" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!app) return null;

  // HTML/JS app — render in sandboxed iframe
  if (app.app_type === "html") {
    return (
      <div style={{ margin: -32, height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{app.icon}</span>
            <strong style={{ fontSize: 14 }}>{app.name}</strong>
          </div>
        </div>
        <iframe
          srcDoc={htmlContent}
          style={{ flex: 1, border: "none", width: "100%" }}
          title={app.name}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      </div>
    );
  }

  // Dashboard app — widget renderer + editor
  if (app.app_type === "dashboard") {
    return <DashboardApp app={app} />;
  }

  // Visual flow app — full flow editor
  if (app.app_type === "visual") {
    return <VisualFlowApp app={app} />;
  }

  return null;
}

// Visual flow app — uses FlowEditor with save + run
function VisualFlowApp({ app }) {
  const [tables, setTables] = useState([]);
  const [runResults, setRunResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentBlocks, setCurrentBlocks] = useState(null);

  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  const config = typeof app.config === "string" ? JSON.parse(app.config) : (app.config || {});
  const initialBlocks = config.blocks || [];

  const handleRun = async (blocks) => {
    setRunResults(null);
    const res = await fetch("/api/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    const data = await res.json();
    setRunResults(data.results || [{ error: data.error }]);
  };

  const handleSave = async () => {
    if (!currentBlocks) return;
    setSaving(true);
    await fetch(`/api/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { blocks: currentBlocks } }),
    });
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>{app.icon} {app.name}</h1>
          {app.description && <p style={{ color: "#666", fontSize: 13, margin: 0 }}>{app.description}</p>}
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13,
        }}>
          {saving ? "Saving..." : "Save Flow"}
        </button>
      </div>
      <FlowEditor
        initialBlocks={initialBlocks}
        tables={tables}
        onSave={(blocks) => setCurrentBlocks(blocks)}
        onRun={handleRun}
        runResults={runResults}
      />
    </div>
  );
}

// Dashboard app — widget editor + viewer (replaces old /-/dashboards system)
function DashboardApp({ app }) {
  const [widgetData, setWidgetData] = useState({});
  const [editing, setEditing] = useState(false);
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);

  const config = typeof app.config === "string" ? JSON.parse(app.config) : (app.config || {});
  const [widgets, setWidgets] = useState(config.widgets || []);
  const [columns, setColumns] = useState(config.layout?.columns || 2);

  useEffect(() => {
    loadWidgetData(widgets);
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  const loadWidgetData = async (w) => {
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

  const saveDashboard = async () => {
    setSaving(true);
    await fetch(`/api/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { widgets, layout: { columns } } }),
    });
    setSaving(false);
    loadWidgetData(widgets);
  };

  const addWidget = (type) => {
    const w = { type, config: {}, width: "auto" };
    if (type === "stat") w.config = { label: "Metric", aggregation: "count" };
    if (type === "text") w.config = { text: "Enter text" };
    if (type === "table") w.config = { max_rows: 10 };
    if (["line", "bar", "pie"].includes(type)) w.config = { title: type + " chart" };
    setWidgets([...widgets, w]);
  };

  const removeWidget = (idx) => setWidgets(widgets.filter((_, i) => i !== idx));
  const updateWidgetConfig = (idx, key, value) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, config: { ...w.config, [key]: value } } : w));
  };
  const setWidgetWidth = (idx, width) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, width } : w));
  };

  const getTableColumns = (tableName) => {
    const t = tables.find((t) => t.name === tableName);
    if (!t) return [];
    const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
    return ["id", ...cols.map((c) => c.name), "created_at"];
  };

  const WIDGET_TYPES = [
    { id: "stat", label: "Stat", icon: "\u{1F522}" },
    { id: "line", label: "Line", icon: "\u{1F4C8}" },
    { id: "bar", label: "Bar", icon: "\u{1F4CA}" },
    { id: "table", label: "Table", icon: "\u{1F4CB}" },
    { id: "text", label: "Text", icon: "\u{1F4DD}" },
    { id: "pie", label: "Pie", icon: "\u{1F967}" },
  ];

  // View mode
  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{app.icon} {app.name}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => loadWidgetData(widgets)} style={btnGray}>Refresh</button>
            <button onClick={() => setEditing(true)} style={btnBlue}>Edit</button>
          </div>
        </div>
        {app.description && <p style={{ color: "#666", fontSize: 13, margin: "-8px 0 16px" }}>{app.description}</p>}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
          {widgets.map((w, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, gridColumn: w.width === "full" ? "1 / -1" : "auto", minHeight: 80 }}>
              <DashWidget widget={w} data={widgetData[i]?.data} />
            </div>
          ))}
        </div>
        {widgets.length === 0 && (
          <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
            No widgets yet. Click Edit to add widgets.
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{app.icon} Edit: {app.name}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#666" }}>Columns:
            <select value={columns} onChange={(e) => setColumns(parseInt(e.target.value))} style={{ marginLeft: 4, padding: 4, fontSize: 13 }}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => { saveDashboard(); setEditing(false); }} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
          <button onClick={() => setEditing(false)} style={btnGray}>Cancel</button>
        </div>
      </div>

      {/* Add widget bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {WIDGET_TYPES.map((t) => (
          <button key={t.id} onClick={() => addWidget(t.id)} style={{
            padding: "6px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Widget grid (editable) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
        {widgets.map((w, i) => {
          const wt = WIDGET_TYPES.find((t) => t.id === w.type);
          return (
            <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 12, gridColumn: w.width === "full" ? "1 / -1" : "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#666" }}>{wt?.icon} {wt?.label}</span>
                <div style={{ display: "flex", gap: 2 }}>
                  <select value={w.width || "auto"} onChange={(e) => setWidgetWidth(i, e.target.value)} style={{ padding: 2, fontSize: 11, border: "1px solid #ddd", borderRadius: 3 }}>
                    <option value="auto">1 col</option><option value="full">Full</option>
                  </select>
                  <button onClick={() => removeWidget(i)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 }}>x</button>
                </div>
              </div>
              {/* Config fields based on type */}
              {w.type === "text" && (
                <textarea value={w.config?.text || ""} onChange={(e) => updateWidgetConfig(i, "text", e.target.value)}
                  style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, minHeight: 60, boxSizing: "border-box" }} />
              )}
              {["stat", "line", "bar", "table", "pie"].includes(w.type) && (
                <div style={{ fontSize: 12 }}>
                  <input placeholder="Title/Label" value={w.config?.title || w.config?.label || ""} onChange={(e) => updateWidgetConfig(i, w.type === "stat" ? "label" : "title", e.target.value)}
                    style={{ width: "100%", padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 12, marginBottom: 4, boxSizing: "border-box" }} />
                  <select value={w.config?.table || ""} onChange={(e) => updateWidgetConfig(i, "table", e.target.value)}
                    style={{ width: "100%", padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 12, marginBottom: 4 }}>
                    <option value="">Select table...</option>
                    {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                  {w.config?.table && w.type === "stat" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <select value={w.config?.column || ""} onChange={(e) => updateWidgetConfig(i, "column", e.target.value)} style={cfgSel}>
                        <option value="">(count)</option>
                        {getTableColumns(w.config.table).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select value={w.config?.aggregation || "count"} onChange={(e) => updateWidgetConfig(i, "aggregation", e.target.value)} style={cfgSel}>
                        {["count", "avg", "sum", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  )}
                  {w.config?.table && ["line", "bar", "pie"].includes(w.type) && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <select value={w.config?.x_column || ""} onChange={(e) => updateWidgetConfig(i, "x_column", e.target.value)} style={cfgSel}>
                        <option value="created_at">x: created_at</option>
                        {getTableColumns(w.config.table).map((c) => <option key={c} value={c}>x: {c}</option>)}
                      </select>
                      <select value={w.config?.y_column || ""} onChange={(e) => updateWidgetConfig(i, "y_column", e.target.value)} style={cfgSel}>
                        <option value="">y: select...</option>
                        {getTableColumns(w.config.table).map((c) => <option key={c} value={c}>y: {c}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Widget renderer (shared between dashboard view + public)
function DashWidget({ widget, data }) {
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
          {type === "line" ? (
            <polyline points={data.values.map((v, i) => `${i * 50 + 25},${h - (v / max) * h}`).join(" ")} fill="none" stroke="#0070f3" strokeWidth={2} />
          ) : (
            data.values.map((v, i) => (
              <g key={i}>
                <rect x={i * 50 + 5} y={h - (v / max) * h} width={40} height={(v / max) * h} fill="#0070f3" rx={3} />
                <text x={i * 50 + 25} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels?.[i] || "").slice(0, 8)}</text>
              </g>
            ))
          )}
        </svg>
      </div>
    );
  }
  return null;
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const cfgSel = { flex: 1, padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 11 };

function getDefaultHtml(app) {
  return `<!DOCTYPE html>
<html>
<head><title>${app.name}</title><style>
body { font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto; color: #333; }
h1 { color: #0070f3; }
.info { background: #f7f7f7; padding: 20px; border-radius: 8px; margin-top: 20px; }
code { background: #e8f4ff; padding: 2px 6px; border-radius: 3px; }
</style></head>
<body>
<h1>${app.icon} ${app.name}</h1>
<p>${app.description || "Your app is ready."}</p>
<div class="info">
<h3>Getting Started</h3>
<p>Upload your app files to <code>/files/apps/${app.slug}/</code></p>
<p>Entry point: <code>${app.entrypoint || "index.html"}</code></p>
<p>Your app can use <code>fetch("/api/...")</code> to access org data.</p>
</div>
</body>
</html>`;
}
