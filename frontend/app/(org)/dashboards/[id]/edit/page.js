"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

const WIDGET_TYPES = [
  { id: "stat", label: "Stat Card", icon: "\u{1F4CA}" },
  { id: "line", label: "Line Chart", icon: "\u{1F4C8}" },
  { id: "bar", label: "Bar Chart", icon: "\u{1F4CA}" },
  { id: "table", label: "Data Table", icon: "\u{1F4CB}" },
  { id: "text", label: "Text", icon: "\u{1F4DD}" },
  { id: "pie", label: "Pie Chart", icon: "\u{1F967}" },
];

export default function DashboardEditor() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [columns, setColumns] = useState(2);
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);

  useEffect(() => {
    fetch(`/api/dashboards/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.dashboard) {
          setDashboard(d.dashboard);
          const w = typeof d.dashboard.widgets === "string" ? JSON.parse(d.dashboard.widgets) : (d.dashboard.widgets || []);
          const l = typeof d.dashboard.layout === "string" ? JSON.parse(d.dashboard.layout) : (d.dashboard.layout || {});
          setWidgets(w);
          setColumns(l.columns || 2);
        }
      });
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, [params.id]);

  const addWidget = (type) => {
    const newWidget = { type, config: {}, width: "auto" };
    if (type === "text") newWidget.config = { text: "Enter text here" };
    if (type === "stat") newWidget.config = { label: "Metric", aggregation: "count" };
    if (type === "table") newWidget.config = { max_rows: 10 };
    if (["line", "bar", "pie"].includes(type)) newWidget.config = { title: type + " chart" };
    setWidgets([...widgets, newWidget]);
    setEditingIdx(widgets.length);
  };

  const removeWidget = (idx) => {
    setWidgets(widgets.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const moveWidget = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= widgets.length) return;
    const copy = [...widgets];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setWidgets(copy);
    setEditingIdx(newIdx);
  };

  const updateWidget = (idx, updates) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, ...updates } : w));
  };

  const updateConfig = (idx, key, value) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, config: { ...w.config, [key]: value } } : w));
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/dashboards/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets, layout: { columns } }),
    });
    setSaving(false);
  };

  if (!user || !dashboard) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;

  const editingWidget = editingIdx !== null ? widgets[editingIdx] : null;

  // Get columns for selected table
  const getTableColumns = (tableName) => {
    const t = tables.find((t) => t.name === tableName);
    if (!t) return [];
    const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
    return cols.map((c) => c.name);
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/dashboards" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Back</Link>
          <h1 style={{ margin: 0, fontSize: 20 }}>Edit: {dashboard.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#666" }}>Columns:
            <select value={columns} onChange={(e) => setColumns(parseInt(e.target.value))} style={{ marginLeft: 4, padding: 4, fontSize: 13 }}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </label>
          <Link href={`/dashboards/${params.id}`} style={{ ...btnSmall, color: "#0070f3", textDecoration: "none" }}>Preview</Link>
          <button onClick={save} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Canvas */}
        <div style={{ flex: 1 }}>
          {/* Add widget bar */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {WIDGET_TYPES.map((t) => (
              <button key={t.id} onClick={() => addWidget(t.id)} style={{
                padding: "6px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 4,
                cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4,
              }}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* Widget grid */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
            {widgets.map((w, i) => (
              <div key={i} onClick={() => setEditingIdx(i)} style={{
                padding: 12, background: editingIdx === i ? "#e8f4ff" : "#fff",
                borderRadius: 8, border: editingIdx === i ? "2px solid #0070f3" : "1px solid #e2e8f0",
                cursor: "pointer", minHeight: 80,
                gridColumn: w.width === "full" ? "1 / -1" : "auto",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {WIDGET_TYPES.find((t) => t.id === w.type)?.icon} {WIDGET_TYPES.find((t) => t.id === w.type)?.label}
                  </span>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={(e) => { e.stopPropagation(); moveWidget(i, -1); }} style={miniBtn}>&uarr;</button>
                    <button onClick={(e) => { e.stopPropagation(); moveWidget(i, 1); }} style={miniBtn}>&darr;</button>
                    <button onClick={(e) => { e.stopPropagation(); removeWidget(i); }} style={{ ...miniBtn, color: "#e53e3e" }}>x</button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#333" }}>
                  {w.config?.title || w.config?.label || w.config?.text?.slice(0, 40) || w.config?.table || "Configure..."}
                </div>
              </div>
            ))}
          </div>

          {widgets.length === 0 && (
            <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "2px dashed #ddd", textAlign: "center", color: "#999" }}>
              Click a widget type above to add it to the dashboard
            </div>
          )}
        </div>

        {/* Config panel */}
        {editingWidget && (
          <div style={{ width: 280, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, flexShrink: 0, alignSelf: "flex-start" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>
              {WIDGET_TYPES.find((t) => t.id === editingWidget.type)?.icon} Configure Widget
            </h3>

            {/* Width */}
            <label style={labelStyle}>Width
              <select value={editingWidget.width || "auto"} onChange={(e) => updateWidget(editingIdx, { width: e.target.value })} style={selectStyle}>
                <option value="auto">Auto (1 col)</option>
                <option value="full">Full width</option>
              </select>
            </label>

            {/* Text widget */}
            {editingWidget.type === "text" && (
              <label style={labelStyle}>Text
                <textarea value={editingWidget.config?.text || ""} onChange={(e) => updateConfig(editingIdx, "text", e.target.value)}
                  style={{ ...selectStyle, minHeight: 80, resize: "vertical" }} />
              </label>
            )}

            {/* Data widgets — table selector */}
            {["stat", "line", "bar", "table", "pie"].includes(editingWidget.type) && (
              <>
                <label style={labelStyle}>Title
                  <input value={editingWidget.config?.title || editingWidget.config?.label || ""} onChange={(e) => {
                    const key = editingWidget.type === "stat" ? "label" : "title";
                    updateConfig(editingIdx, key, e.target.value);
                  }} style={selectStyle} />
                </label>

                <label style={labelStyle}>Data Table
                  <select value={editingWidget.config?.table || ""} onChange={(e) => updateConfig(editingIdx, "table", e.target.value)} style={selectStyle}>
                    <option value="">Select table...</option>
                    {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </label>

                {editingWidget.config?.table && editingWidget.type === "stat" && (
                  <>
                    <label style={labelStyle}>Column
                      <select value={editingWidget.config?.column || ""} onChange={(e) => updateConfig(editingIdx, "column", e.target.value)} style={selectStyle}>
                        <option value="">(count rows)</option>
                        {getTableColumns(editingWidget.config.table).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={labelStyle}>Aggregation
                      <select value={editingWidget.config?.aggregation || "count"} onChange={(e) => updateConfig(editingIdx, "aggregation", e.target.value)} style={selectStyle}>
                        {["count", "avg", "sum", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </label>
                  </>
                )}

                {editingWidget.config?.table && ["line", "bar", "pie"].includes(editingWidget.type) && (
                  <>
                    <label style={labelStyle}>X Column
                      <select value={editingWidget.config?.x_column || ""} onChange={(e) => updateConfig(editingIdx, "x_column", e.target.value)} style={selectStyle}>
                        <option value="created_at">created_at</option>
                        {getTableColumns(editingWidget.config.table).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={labelStyle}>Y Column
                      <select value={editingWidget.config?.y_column || ""} onChange={(e) => updateConfig(editingIdx, "y_column", e.target.value)} style={selectStyle}>
                        <option value="">Select...</option>
                        {getTableColumns(editingWidget.config.table).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </>
                )}

                {editingWidget.config?.table && editingWidget.type === "table" && (
                  <label style={labelStyle}>Max Rows
                    <input type="number" value={editingWidget.config?.max_rows || 10} onChange={(e) => updateConfig(editingIdx, "max_rows", parseInt(e.target.value) || 10)} style={selectStyle} />
                  </label>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const miniBtn = { padding: "2px 6px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "#666" };
const labelStyle = { display: "block", fontSize: 12, color: "#666", marginBottom: 8 };
const selectStyle = { display: "block", width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4 };
