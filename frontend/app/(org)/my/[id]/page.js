"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";

// ─── Page shell (shared across all page types) ───────────────────────────────
export default function PageViewer() {
  const { user, refresh } = useUser();
  const params = useParams();
  const router = useRouter();
  const [page, setPage] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);

  useEffect(() => {
    loadPage();
    fetch("/api/users").then((r) => r.ok ? r.json() : { users: [] }).then((d) => setOrgUsers(d.users || []));
  }, [params.id]);

  const loadPage = async () => {
    const res = await fetch(`/api/pages/${params.id}`);
    if (!res.ok) { router.push("/"); return; }
    const d = await res.json();
    setPage(d.page);
  };

  const deletePage = async () => {
    if (!confirm("Delete this page?")) return;
    await fetch(`/api/pages/${params.id}`, { method: "DELETE" });
    refresh();
    router.push("/");
  };

  const clonePage = async () => {
    const res = await fetch(`/api/pages/${params.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clone" }),
    });
    if (res.ok) { const d = await res.json(); refresh(); router.push(`/my/${d.page.id}`); }
  };

  const updateVisibility = async (visibility) => {
    await fetch(`/api/pages/${params.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    loadPage();
  };

  const updateSharing = async (sharedWith) => {
    await fetch(`/api/pages/${params.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared_with: sharedWith }),
    });
    loadPage();
  };

  const saveConfig = async (config) => {
    await fetch(`/api/pages/${params.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    refresh();
  };

  if (!user || !page) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;
  const isOwner = page.user_id === user.id;

  // Render based on page_type
  const renderers = {
    dashboard: DashboardRenderer,
    html: HtmlRenderer,
    visual: VisualRenderer,
    notebook: NotebookRenderer,
  };
  const Renderer = renderers[page.page_type] || DashboardRenderer;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>{page.icon}</span>
          <h1 style={{ margin: 0, fontSize: 20 }}>{page.name}</h1>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#e8f4ff", color: "#0070f3" }}>
            {page.page_type}
          </span>
          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: page.visibility === "org" ? "#e8f4ff" : page.visibility === "public" ? "#f0fde8" : "#f7f7f7", color: page.visibility === "org" ? "#0070f3" : page.visibility === "public" ? "#38a169" : "#999" }}>
            {page.visibility}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isOwner && <button onClick={clonePage} style={btnGray}>Clone</button>}
          {isOwner && <button onClick={() => setShowShare(!showShare)} style={btnGray}>Share</button>}
          {isOwner && <button onClick={deletePage} style={{ ...btnGray, color: "#e53e3e" }}>Delete</button>}
        </div>
      </div>

      {/* Share dialog */}
      {showShare && isOwner && (
        <ShareDialog page={page} user={user} orgUsers={orgUsers} onVisibility={updateVisibility} onShare={updateSharing} onClose={() => setShowShare(false)} />
      )}

      {/* Page content — type-specific renderer */}
      <Renderer page={page} isOwner={isOwner} saveConfig={saveConfig} onReload={loadPage} />
    </div>
  );
}

// ─── Share dialog ─────────────────────────────────────────────────────────────
function ShareDialog({ page, user, orgUsers, onVisibility, onShare, onClose }) {
  return (
    <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #0070f3" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Share</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["private", "org", "public"].map((v) => (
          <button key={v} onClick={() => onVisibility(v)} style={{
            flex: 1, padding: 8, borderRadius: 6, cursor: "pointer", textAlign: "center", fontSize: 12,
            border: page.visibility === v ? "2px solid #0070f3" : "1px solid #ddd",
            background: page.visibility === v ? "#e8f4ff" : "#fff", fontWeight: 600,
          }}>
            {v === "private" ? "\u{1F512} Private" : v === "org" ? "\u{1F465} Org" : "\u{1F310} Public"}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>Share with users:</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {orgUsers.filter((u) => u.id !== user.id).map((u) => {
          const isShared = (page.shared_with || []).some((s) => s.type === "user" && s.id === u.id);
          return (
            <button key={u.id} onClick={() => {
              const current = page.shared_with || [];
              const next = isShared ? current.filter((s) => !(s.type === "user" && s.id === u.id)) : [...current, { type: "user", id: u.id }];
              onShare(next);
            }} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer",
              background: isShared ? "#e8f4ff" : "#f7f7f7", border: isShared ? "1px solid #0070f3" : "1px solid #ddd",
            }}>
              {u.first_name || u.username} {isShared && "\u2713"}
            </button>
          );
        })}
      </div>
      <button onClick={onClose} style={btnGray}>Done</button>
    </div>
  );
}

// ─── Dashboard renderer (widget grid) ─────────────────────────────────────────
const WIDGET_TYPES = [
  { id: "stat", label: "Stat", icon: "\u{1F522}" },
  { id: "line", label: "Line", icon: "\u{1F4C8}" },
  { id: "bar", label: "Bar", icon: "\u{1F4CA}" },
  { id: "table", label: "Table", icon: "\u{1F4CB}" },
  { id: "text", label: "Text", icon: "\u{1F4DD}" },
  { id: "pie", label: "Pie", icon: "\u{1F967}" },
];

function DashboardRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const [widgets, setWidgets] = useState(cfg.widgets || []);
  const [layout, setLayout] = useState(cfg.layout || { columns: 2 });
  const [widgetData, setWidgetData] = useState({});
  const [editing, setEditing] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  useEffect(() => {
    const c = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
    const w = c.widgets || [];
    setWidgets(w);
    setLayout(c.layout || { columns: 2 });
    loadWidgetData(w);
  }, [page.id]);

  const loadWidgetData = async (w) => {
    const data = {};
    for (let i = 0; i < w.length; i++) {
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w[i] }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData(data);
  };

  const save = async () => {
    setSaving(true);
    await saveConfig({ widgets, layout });
    setSaving(false);
    loadWidgetData(widgets);
  };

  const addWidget = (type) => {
    const w = { type, config: {}, w: 1, h: 1 };
    if (type === "stat") w.config = { label: "Metric", aggregation: "count" };
    if (type === "text") w.config = { text: "Enter text" };
    if (type === "table") w.config = { max_rows: 10 };
    setWidgets([...widgets, w]);
    setEditIdx(widgets.length);
  };
  const removeWidget = (idx) => { setWidgets(widgets.filter((_, i) => i !== idx)); setEditIdx(null); };
  const moveWidget = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= widgets.length) return;
    const c = [...widgets]; [c[idx], c[ni]] = [c[ni], c[idx]]; setWidgets(c); setEditIdx(ni);
  };
  const updateConfig = (idx, key, val) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, config: { ...w.config, [key]: val } } : w));
  };
  const setWidgetSize = (idx, colSpan, rowSpan) => {
    setWidgets(widgets.map((w, i) => i === idx ? { ...w, colSpan: colSpan || w.colSpan || 1, rowSpan: rowSpan || w.rowSpan || 1 } : w));
  };
  const getTableCols = (name) => {
    const t = tables.find((t) => t.name === name);
    if (!t) return [];
    const c = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
    return ["id", ...c.map((col) => col.name), "created_at"];
  };

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {!editing && <button onClick={() => loadWidgetData(widgets)} style={btnGray}>Refresh</button>}
        {isOwner && (
          editing
            ? <>
                <button onClick={() => { save(); setEditing(false); setEditIdx(null); }} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => { setEditing(false); setEditIdx(null); }} style={btnGray}>Cancel</button>
              </>
            : <button onClick={() => setEditing(true)} style={btnBlue}>Edit</button>
        )}
      </div>

      {/* Widget add bar */}
      {editing && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {WIDGET_TYPES.map((t) => (
            <button key={t.id} onClick={() => addWidget(t.id)} style={{ padding: "6px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
              {t.icon} {t.label}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>Columns:
            <select value={layout.columns} onChange={(e) => setLayout({ ...layout, columns: parseInt(e.target.value) })} style={{ marginLeft: 4, padding: 4, fontSize: 13 }}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
        </div>
      )}

      {/* Widget grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 12, gridAutoRows: "minmax(120px, auto)" }}>
        {widgets.map((w, i) => {
          const cs = w.colSpan || 1;
          const rs = w.rowSpan || 1;
          return (
            <div key={i} onClick={() => editing && setEditIdx(i)} style={{
              background: "#fff", borderRadius: 8, padding: editing ? 12 : 16,
              border: editing && editIdx === i ? "2px solid #0070f3" : "1px solid #e2e8f0",
              gridColumn: `span ${Math.min(cs, layout.columns || 2)}`,
              gridRow: `span ${rs}`,
              cursor: editing ? "pointer" : "default", minHeight: 80,
              position: "relative", overflow: "hidden",
            }}>
              {editing && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#999" }}>{WIDGET_TYPES.find((t) => t.id === w.type)?.icon} {WIDGET_TYPES.find((t) => t.id === w.type)?.label}</span>
                  <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#999" }}>W:</span>
                    {[1, 2, 3, 4].filter((n) => n <= (layout.columns || 2)).map((n) => (
                      <button key={`w${n}`} onClick={(e) => { e.stopPropagation(); setWidgetSize(i, n, rs); }}
                        style={{ ...sizeBtn, background: cs === n ? "#0070f3" : "#f0f0f0", color: cs === n ? "#fff" : "#666" }}>{n}</button>
                    ))}
                    <span style={{ fontSize: 9, color: "#999", marginLeft: 4 }}>H:</span>
                    {[1, 2, 3].map((n) => (
                      <button key={`h${n}`} onClick={(e) => { e.stopPropagation(); setWidgetSize(i, cs, n); }}
                        style={{ ...sizeBtn, background: rs === n ? "#0070f3" : "#f0f0f0", color: rs === n ? "#fff" : "#666" }}>{n}</button>
                    ))}
                    <button onClick={(e) => { e.stopPropagation(); moveWidget(i, -1); }} style={miniBtn}>&uarr;</button>
                    <button onClick={(e) => { e.stopPropagation(); moveWidget(i, 1); }} style={miniBtn}>&darr;</button>
                    <button onClick={(e) => { e.stopPropagation(); removeWidget(i); }} style={{ ...miniBtn, color: "#e53e3e" }}>x</button>
                  </div>
                </div>
              )}
              {editing && editIdx === i ? (
                <WidgetConfig widget={w} tables={tables} getTableCols={getTableCols} updateConfig={(k, v) => updateConfig(i, k, v)} />
              ) : (
                <WidgetView widget={w} data={widgetData[i]?.data} />
              )}
            </div>
          );
        })}
      </div>

      {widgets.length === 0 && (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: editing ? "2px dashed #0070f3" : "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          {editing ? "Click a widget type above to add it" : "Empty dashboard. Click Edit to add widgets."}
        </div>
      )}
    </>
  );
}

// ─── HTML page renderer (code editor + preview) ──────────────────────────────
function HtmlRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const [html, setHtml] = useState(cfg.html || DEFAULT_HTML);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const save = async () => {
    setSaving(true);
    await saveConfig({ ...cfg, html });
    setSaving(false);
    setPreviewKey((k) => k + 1);
  };

  // Build iframe srcdoc with SDK injection
  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
<script src="/sdk.js"><\/script>
</head><body>${html}</body></html>`;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {isOwner && (
          editing
            ? <>
                <button onClick={() => { save(); setEditing(false); }} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => { setEditing(false); setHtml(cfg.html || DEFAULT_HTML); }} style={btnGray}>Cancel</button>
              </>
            : <button onClick={() => setEditing(true)} style={btnBlue}>Edit Code</button>
        )}
        <button onClick={() => setPreviewKey((k) => k + 1)} style={btnGray}>Refresh</button>
      </div>

      {editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 500 }}>
          {/* Code editor */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "#666", padding: "4px 8px", background: "#f0f0f0", borderRadius: "6px 6px 0 0" }}>HTML + JavaScript</div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: 12, fontFamily: "monospace", fontSize: 13, lineHeight: 1.5,
                border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px",
                resize: "none", background: "#1e1e1e", color: "#d4d4d4", tabSize: 2,
              }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const { selectionStart, selectionEnd } = e.target;
                  setHtml(html.substring(0, selectionStart) + "  " + html.substring(selectionEnd));
                  setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = selectionStart + 2; }, 0);
                }
              }}
            />
          </div>
          {/* Live preview */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "#666", padding: "4px 8px", background: "#f0f0f0", borderRadius: "6px 6px 0 0" }}>Preview</div>
            <iframe
              key={previewKey}
              srcDoc={srcdoc}
              style={{ flex: 1, border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px", background: "#fff" }}
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Preview"
            />
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden", minHeight: 400 }}>
          <iframe
            key={previewKey}
            srcDoc={srcdoc}
            style={{ width: "100%", height: 600, border: "none" }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Page"
          />
        </div>
      )}
    </>
  );
}

const DEFAULT_HTML = `<div style="padding: 24px; max-width: 800px; margin: 0 auto">
  <h1>My Web Page</h1>
  <p>Edit this page to build your app. The IoT Stack SDK is available:</p>
  <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px">
// Query data
const result = await IoTStack.query("SELECT * FROM my_table LIMIT 5");
console.log(result.rows);

// Check permissions
const canView = await IoTStack.can("app.my_app");
  </pre>
  <div id="output" style="margin-top: 16px; padding: 12px; background: #f0f7ff; border-radius: 6px"></div>
  <script>
    document.getElementById("output").textContent = "Page loaded at " + new Date().toLocaleString();
  </script>
</div>`;

// ─── Visual flow renderer (placeholder) ──────────────────────────────────────
function VisualRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const blocks = cfg.blocks || [];

  return (
    <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", minHeight: 300 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u{1F9E9}"}</div>
      <h2 style={{ margin: "0 0 8px" }}>Visual Flow Editor</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Block-based visual programming for data flows and automations.
      </p>
      <p style={{ color: "#999", fontSize: 13, marginTop: 8 }}>
        {blocks.length} block{blocks.length !== 1 ? "s" : ""} configured. Visual editor coming soon.
      </p>
    </div>
  );
}

// ─── Notebook renderer (Jupyter iframe) ──────────────────────────────────────
function NotebookRenderer({ page, isOwner }) {
  const [jupyterUrl, setJupyterUrl] = useState(null);
  const [showJupyter, setShowJupyter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const openNotebook = async () => {
    setLoading(true);
    setError("");
    const name = page.slug || page.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { setError((await res.json()).error); setLoading(false); return; }
    const data = await res.json();
    setJupyterUrl(data.url);
    setShowJupyter(true);
    setLoading(false);
  };

  if (showJupyter && jupyterUrl) {
    return (
      <div style={{ margin: "-32px -32px 0", display: "flex", flexDirection: "column", height: "calc(100vh - 49px)" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 16px", background: "#1a1a2e", color: "#fff", fontSize: 13, flexShrink: 0,
        }}>
          <div>
            <strong>{page.icon} {page.name}</strong>
            <span style={{ color: "#888", marginLeft: 12 }}>Notebook</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.open(jupyterUrl, "_blank")} style={toolbarBtn}>New tab</button>
            <button onClick={() => setShowJupyter(false)} style={toolbarBtn}>Back</button>
          </div>
        </div>
        <iframe src={jupyterUrl} style={{ flex: 1, border: "none", width: "100%" }} title="JupyterLab" allow="clipboard-read; clipboard-write" />
      </div>
    );
  }

  return (
    <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", minHeight: 300 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u{1F4D3}"}</div>
      <h2 style={{ margin: "0 0 8px" }}>{page.name}</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Jupyter notebook with IoT Stack SDK pre-loaded.
      </p>
      <button onClick={openNotebook} disabled={loading} style={btnBlue}>
        {loading ? "Starting..." : "Open Notebook"}
      </button>
      {error && <p style={{ color: "#e53e3e", margin: "12px 0 0", fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 24, textAlign: "left", maxWidth: 500, margin: "24px auto 0" }}>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto", lineHeight: 1.6 }}>
{`# Auto-injected SDK
from iot_stack import connect
client = connect()

client.tables()              # list tables
df = client.query_table("t") # query into DataFrame
client.files.list()          # list org files`}
        </pre>
      </div>
    </div>
  );
}

// ─── Widget components (for dashboard) ────────────────────────────────────────
function WidgetConfig({ widget, tables, getTableCols, updateConfig }) {
  const { type, config } = widget;
  if (type === "text") return <textarea value={config?.text || ""} onChange={(e) => updateConfig("text", e.target.value)} style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, minHeight: 50, boxSizing: "border-box" }} />;
  return (
    <div style={{ fontSize: 12 }}>
      <input placeholder="Title/Label" value={config?.title || config?.label || ""} onChange={(e) => updateConfig(type === "stat" ? "label" : "title", e.target.value)} style={cfgInput} />
      <select value={config?.table || ""} onChange={(e) => updateConfig("table", e.target.value)} style={cfgInput}>
        <option value="">Select table...</option>
        {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      {config?.table && type === "stat" && (
        <div style={{ display: "flex", gap: 4 }}>
          <select value={config?.column || ""} onChange={(e) => updateConfig("column", e.target.value)} style={cfgInput}>
            <option value="">(count)</option>
            {getTableCols(config.table).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={config?.aggregation || "count"} onChange={(e) => updateConfig("aggregation", e.target.value)} style={cfgInput}>
            {["count", "avg", "sum", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      )}
      {config?.table && ["line", "bar", "pie"].includes(type) && (
        <div style={{ display: "flex", gap: 4 }}>
          <select value={config?.x_column || ""} onChange={(e) => updateConfig("x_column", e.target.value)} style={cfgInput}>
            <option value="created_at">x: created_at</option>
            {getTableCols(config.table).map((c) => <option key={c} value={c}>x: {c}</option>)}
          </select>
          <select value={config?.y_column || ""} onChange={(e) => updateConfig("y_column", e.target.value)} style={cfgInput}>
            <option value="">y: select...</option>
            {getTableCols(config.table).map((c) => <option key={c} value={c}>y: {c}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function WidgetView({ widget, data }) {
  if (!data) return <div style={{ color: "#ccc", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{data.error}</div>;
  const { type, config } = widget;
  if (type === "stat") return <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{data.label}</div><div style={{ fontSize: 32, fontWeight: 700 }}>{data.value ?? "\u2014"}</div></div>;
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
    const max = Math.max(...data.values, 1); const h = 120;
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>{config.title}</h3>}
        <svg width="100%" height={h + 25} viewBox={`0 0 ${Math.max(data.values.length * 45, 180)} ${h + 25}`}>
          {type === "line" ? (
            <polyline points={data.values.map((v, i) => `${i * 45 + 22},${h - (v / max) * h}`).join(" ")} fill="none" stroke="#0070f3" strokeWidth={2} />
          ) : (
            data.values.map((v, i) => <g key={i}><rect x={i * 45 + 3} y={h - (v / max) * h} width={38} height={(v / max) * h} fill="#0070f3" rx={3} /><text x={i * 45 + 22} y={h + 12} textAnchor="middle" fontSize={8} fill="#666">{String(data.labels?.[i] || "").slice(0, 6)}</text></g>))
          }
        </svg>
      </div>
    );
  }
  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGray = { padding: "8px 16px", background: "#f0f0f0", color: "#333", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const miniBtn = { padding: "1px 5px", background: "none", border: "1px solid #ddd", borderRadius: 2, cursor: "pointer", fontSize: 10, color: "#666" };
const sizeBtn = { padding: "1px 5px", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: "center" };
const cfgInput = { display: "block", width: "100%", padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 12, marginBottom: 4, boxSizing: "border-box" };
const toolbarBtn = { padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 };
