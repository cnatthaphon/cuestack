"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";
import FlowCanvas from "../../../../lib/components/flow-canvas.js";

// ─── Page shell (shared across all page types) ───────────────────────────────
export default function PageViewer() {
  const { user, refresh, hasPermission } = useUser();
  const params = useParams();
  const router = useRouter();
  const [page, setPage] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
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
    // Config versioning — increment on every save
    const currentCfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
    config._version = (currentCfg._version || 0) + 1;
    config._updated_by = user.username;
    config._updated_at = new Date().toISOString();
    await fetch(`/api/pages/${params.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    refresh();
  };

  if (!user || !page) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;
  const isOwner = page.user_id === user.id;
  // Schedule only for executable types (notebook, visual). Not for dashboard/html.
  const SCHEDULABLE = ["notebook", "visual", "python"];
  const SERVICEABLE = ["python", "visual"];
  const canSchedule = isOwner && hasPermission("pages.schedule") && SCHEDULABLE.includes(page.page_type);
  const canService = isOwner && hasPermission("services.manage") && SERVICEABLE.includes(page.page_type);
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const isService = cfg.is_service === true;

  // Render based on page_type
  const renderers = {
    dashboard: DashboardRenderer,
    html: HtmlRenderer,
    visual: VisualRenderer,
    notebook: NotebookRenderer,
    python: PythonRenderer,
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
          {isService && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: cfg.service_status === "running" ? "#f0fde8" : "#fef2f2", color: cfg.service_status === "running" ? "#15803d" : "#dc2626", fontWeight: 600 }}>
              {cfg.service_status === "running" ? "\u25CF running" : "\u25CB stopped"}
            </span>
          )}
          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: page.visibility === "org" ? "#e8f4ff" : page.visibility === "public" ? "#f0fde8" : "#f7f7f7", color: page.visibility === "org" ? "#0070f3" : page.visibility === "public" ? "#38a169" : "#999" }}>
            {page.visibility}
          </span>
          {hasSchedule(page) && (
            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#fff3e0", color: "#e65100" }} title="Scheduled">
              {"\u23F0"} {getScheduleLabel(page)}
            </span>
          )}
          {getConfigVersion(page) > 0 && (
            <span style={{ fontSize: 10, color: "#bbb" }} title={`Last edited by ${getConfigUpdatedBy(page)}`}>v{getConfigVersion(page)}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => {
            await fetch("/api/pins", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "pin", page_id: page.id, scope: "personal" }) });
            refresh();
          }} style={{ ...btnGray, padding: "8px 10px" }} title="Pin to top">{"\u2B50"}</button>
          {!isOwner && <button onClick={clonePage} style={btnGray}>Clone</button>}
          {canService && (
            <button onClick={async () => {
              const next = { ...cfg, is_service: !isService };
              if (!isService) next.service_status = "running";
              else next.service_status = "stopped";
              await saveConfig(next);
              loadPage();
            }} style={{ ...btnGray, background: isService ? "#f0fde8" : undefined, color: isService ? "#15803d" : undefined, borderColor: isService ? "#22c55e" : undefined }}>
              {isService ? "\u25A0 Stop Service" : "\u25B6 Run as Service"}
            </button>
          )}
          {canSchedule && <button onClick={() => { setShowSchedule(!showSchedule); setShowShare(false); }} style={btnGray}>{"\u23F0"} Schedule</button>}
          {isOwner && <button onClick={() => { setShowShare(!showShare); setShowSchedule(false); }} style={btnGray}>Share</button>}
          {isOwner && <button onClick={deletePage} style={{ ...btnGray, color: "#e53e3e" }}>Delete</button>}
        </div>
      </div>

      {/* Schedule dialog */}
      {showSchedule && isOwner && (
        <ScheduleDialog page={page} saveConfig={saveConfig} onReload={loadPage} onClose={() => setShowSchedule(false)} />
      )}

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

// ─── Schedule helpers ─────────────────────────────────────────────────────────
function hasSchedule(page) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  return !!cfg.schedule?.cron;
}

const CRON_PRESETS = [
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 8 AM", value: "0 8 * * *" },
  { label: "Weekly (Monday)", value: "0 0 * * 1" },
];

function getScheduleLabel(page) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const cron = cfg.schedule?.cron;
  if (!cron) return "";
  const preset = CRON_PRESETS.find((p) => p.value === cron);
  return preset ? preset.label : cron;
}

function getConfigVersion(page) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  return cfg._version || 0;
}

function getConfigUpdatedBy(page) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  return cfg._updated_by || "";
}

// ─── Schedule dialog ──────────────────────────────────────────────────────────
function ScheduleDialog({ page, saveConfig, onReload, onClose }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const existing = cfg.schedule || {};
  const [cron, setCron] = useState(existing.cron || "");
  const [enabled, setEnabled] = useState(existing.enabled !== false);
  const [customCron, setCustomCron] = useState("");
  const [saving, setSaving] = useState(false);

  const isPreset = CRON_PRESETS.some((p) => p.value === cron);

  const save = async () => {
    setSaving(true);
    const newConfig = { ...cfg, schedule: cron ? { cron, enabled, updated_at: new Date().toISOString() } : undefined };
    if (!cron) delete newConfig.schedule;
    await saveConfig(newConfig);
    setSaving(false);
    onReload();
    onClose();
  };

  const remove = async () => {
    setSaving(true);
    const newConfig = { ...cfg };
    delete newConfig.schedule;
    await saveConfig(newConfig);
    setSaving(false);
    onReload();
    onClose();
  };

  return (
    <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #e65100" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
        {"\u23F0"} Schedule Task
      </h3>

      <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
        Run this {page.page_type} automatically on a schedule.
      </p>

      {/* Preset buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {CRON_PRESETS.map((p) => (
          <button key={p.value} onClick={() => { setCron(p.value); setCustomCron(""); }} style={{
            padding: "6px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer",
            border: cron === p.value ? "2px solid #e65100" : "1px solid #ddd",
            background: cron === p.value ? "#fff3e0" : "#fff", fontWeight: cron === p.value ? 600 : 400,
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom cron */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          placeholder="Custom cron: * * * * *"
          value={!isPreset ? cron : customCron}
          onChange={(e) => { setCustomCron(e.target.value); setCron(e.target.value); }}
          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }}
        />
        <a href="https://crontab.guru/" target="_blank" rel="noopener" style={{ fontSize: 11, color: "#0070f3" }}>crontab.guru</a>
      </div>

      {/* Enable/disable toggle */}
      {cron && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Schedule enabled
        </label>
      )}

      {/* Current schedule info */}
      {existing.cron && (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 12, padding: 8, background: "#f7f7f7", borderRadius: 4 }}>
          Current: <code>{existing.cron}</code>
          {existing.last_run && <span> &middot; Last run: {new Date(existing.last_run).toLocaleString()}</span>}
          {existing.next_run && <span> &middot; Next: {new Date(existing.next_run).toLocaleString()}</span>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={btnBlue}>{saving ? "Saving..." : cron ? "Save Schedule" : "Clear Schedule"}</button>
        {existing.cron && <button onClick={remove} disabled={saving} style={{ ...btnGray, color: "#e53e3e" }}>Remove Schedule</button>}
        <button onClick={onClose} style={btnGray}>Cancel</button>
      </div>
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
  { id: "live", label: "Live", icon: "\u{1F4E1}" },
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
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const gridRef = useRef(null);

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
    const w = { type, config: {}, colSpan: 1, rowSpan: 1 };
    if (type === "stat") w.config = { label: "Metric", aggregation: "count" };
    if (type === "text") w.config = { text: "Enter text" };
    if (type === "table") { w.config = { max_rows: 10 }; w.colSpan = 2; w.rowSpan = 2; }
    if (type === "chart") w.colSpan = 2;
    if (type === "live") w.colSpan = 2;
    setWidgets([...widgets, w]);
    setEditIdx(widgets.length);
  };
  const removeWidget = (idx) => { setWidgets(widgets.filter((_, i) => i !== idx)); setEditIdx(null); };
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

  // Drag-and-drop reorder
  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx);
    e.target.style.opacity = "0.4";
  };
  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
    setDragIdx(null);
    setDropIdx(null);
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== dropIdx) setDropIdx(idx);
  };
  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const updated = [...widgets];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(targetIdx, 0, moved);
    setWidgets(updated);
    setEditIdx(targetIdx);
    setDragIdx(null);
    setDropIdx(null);
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

      {/* Widget grid — drag to reorder, drag corner to resize */}
      <div ref={gridRef} data-widget-grid style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 12, gridAutoRows: "minmax(120px, auto)" }}>
        {widgets.map((w, i) => {
          const cs = w.colSpan || 1;
          const rs = w.rowSpan || 1;
          const isDropTarget = editing && dropIdx === i && dragIdx !== i;
          return (
            <div
              key={i}
              draggable={editing}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onClick={() => editing && setEditIdx(editIdx === i ? null : i)}
              style={{
                background: "#fff", borderRadius: 8, padding: editing ? 12 : 16,
                border: isDropTarget ? "2px dashed #3b82f6" : editing && editIdx === i ? "2px solid #0070f3" : "1px solid #e2e8f0",
                gridColumn: `span ${Math.min(cs, layout.columns || 2)}`,
                gridRow: `span ${rs}`,
                cursor: editing ? "grab" : "default", minHeight: 80,
                position: "relative", overflow: "hidden",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: isDropTarget ? "0 0 0 3px rgba(59,130,246,0.15)" : "none",
              }}
            >
              {/* Edit header — minimal: type label + delete */}
              {editing && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", cursor: "grab" }}>
                    {"\u2630"} {WIDGET_TYPES.find((t) => t.id === w.type)?.icon} {WIDGET_TYPES.find((t) => t.id === w.type)?.label}
                    <span style={{ color: "#cbd5e1", marginLeft: 6, fontSize: 9 }}>{cs}x{rs}</span>
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); removeWidget(i); }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}
                    title="Remove widget">{"\u00D7"}</button>
                </div>
              )}

              {/* Widget content or config */}
              {editing && editIdx === i ? (
                <WidgetConfig widget={w} tables={tables} getTableCols={getTableCols} updateConfig={(k, v) => updateConfig(i, k, v)} />
              ) : (
                <WidgetView widget={w} data={widgetData[i]?.data} />
              )}

              {/* Resize handle — drag corner to resize */}
              {editing && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startW = cs;
                    const startH = rs;
                    const gridEl = gridRef.current;
                    const cellW = gridEl ? gridEl.offsetWidth / (layout.columns || 2) : 200;
                    const cellH = 132;

                    const onMove = (me) => {
                      me.preventDefault();
                      const dx = me.clientX - startX;
                      const dy = me.clientY - startY;
                      const newW = Math.max(1, Math.min(layout.columns || 2, startW + Math.round(dx / cellW)));
                      const newH = Math.max(1, Math.min(4, startH + Math.round(dy / cellH)));
                      if (newW !== cs || newH !== rs) setWidgetSize(i, newW, newH);
                    };
                    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                  style={{
                    position: "absolute", bottom: 0, right: 0, width: 20, height: 20, cursor: "nwse-resize",
                    background: "linear-gradient(135deg, transparent 40%, #94a3b8 40%, #94a3b8 50%, transparent 50%, transparent 65%, #94a3b8 65%, #94a3b8 75%, transparent 75%)",
                    borderRadius: "0 0 6px 0", opacity: 0.4,
                  }}
                  title="Drag to resize"
                  draggable={false}
                />
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

// ─── HTML page renderer (tabbed code editor + preview) ──────────────────────
function HtmlRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});

  // Backward compat: old pages store everything in cfg.html (may contain <style>/<script>)
  // New pages store cfg.html_body, cfg.css, cfg.js separately
  const migrateOld = (c) => {
    if (c.html_body !== undefined) return { body: c.html_body || "", css: c.css || "", js: c.js || "" };
    // Parse legacy single-field html into parts
    const raw = c.html || DEFAULT_BODY;
    let css = "", js = "", body = raw;
    // Extract <style>...</style>
    body = body.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, s) => { css += s.trim() + "\n"; return ""; });
    // Extract <script>...</script>
    body = body.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, s) => { js += s.trim() + "\n"; return ""; });
    return { body: body.trim(), css: css.trim(), js: js.trim() };
  };

  const parts = migrateOld(cfg);
  const [htmlBody, setHtmlBody] = useState(parts.body);
  const [css, setCss] = useState(parts.css);
  const [js, setJs] = useState(parts.js);
  const [previewJs, setPreviewJs] = useState(parts.js); // JS only runs on explicit "Run"
  const [activeTab, setActiveTab] = useState("html");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const runPreview = () => { setPreviewJs(js); setPreviewKey((k) => k + 1); };

  const save = async () => {
    setSaving(true);
    await saveConfig({ ...cfg, html_body: htmlBody, css, js, html: undefined });
    setSaving(false);
    setPreviewJs(js);
    setPreviewKey((k) => k + 1);
  };

  const cancel = () => {
    setEditing(false);
    const p = migrateOld(cfg);
    setHtmlBody(p.body); setCss(p.css); setJs(p.js); setPreviewJs(p.js);
  };

  // Build iframe srcdoc — uses previewJs (not live js) to avoid partial-typing errors
  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}${css ? "\n" + css : ""}</style>
<script src="/sdk.js"><\/script>
</head><body>${htmlBody}${previewJs ? "\n<script>" + previewJs + "<\/script>" : ""}</body></html>`;

  const TABS = [
    { id: "html", label: "HTML", color: "#e34c26" },
    { id: "css", label: "CSS", color: "#264de4" },
    { id: "js", label: "JavaScript", color: "#f7df1e" },
  ];

  const tabContent = { html: htmlBody, css, js };
  const tabSetter = { html: setHtmlBody, css: setCss, js: setJs };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {isOwner && (
          editing
            ? <>
                <button onClick={() => { save(); setEditing(false); }} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={cancel} style={btnGray}>Cancel</button>
                <button onClick={runPreview} style={{ ...btnGray, background: "#38a169", color: "#fff" }} title="Run JS in preview (Ctrl+Enter)">&#9654; Run</button>
              </>
            : <button onClick={() => setEditing(true)} style={btnBlue}>Edit Code</button>
        )}
        <button onClick={runPreview} style={btnGray}>Refresh</button>
        {editing && activeTab === "js" && <span style={{ fontSize: 11, color: "#999" }}>Ctrl+Enter to run</span>}
      </div>

      {editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 500 }}>
          {/* Tabbed code editor */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", background: "#f0f0f0", borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: "6px 16px", fontSize: 12, fontWeight: activeTab === t.id ? 600 : 400,
                  background: activeTab === t.id ? "#1e1e1e" : "transparent",
                  color: activeTab === t.id ? t.color : "#666",
                  border: "none", cursor: "pointer",
                  borderBottom: activeTab === t.id ? `2px solid ${t.color}` : "2px solid transparent",
                }}>{t.label}</button>
              ))}
            </div>
            <textarea
              value={tabContent[activeTab]}
              onChange={(e) => tabSetter[activeTab](e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: 12, fontFamily: "monospace", fontSize: 13, lineHeight: 1.5,
                border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px",
                resize: "none", background: "#1e1e1e", color: "#d4d4d4", tabSize: 2,
              }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const val = tabContent[activeTab];
                  const { selectionStart, selectionEnd } = e.target;
                  tabSetter[activeTab](val.substring(0, selectionStart) + "  " + val.substring(selectionEnd));
                  setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = selectionStart + 2; }, 0);
                }
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runPreview(); }
              }}
              placeholder={activeTab === "html" ? "Write your HTML markup here..." : activeTab === "css" ? "body { background: #f5f5f5; }\n.card { padding: 16px; }" : "// Your JavaScript code\ndocument.addEventListener('DOMContentLoaded', () => {\n  \n});"}
            />
          </div>
          {/* Live preview */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, color: "#666", padding: "6px 8px", background: "#f0f0f0", borderRadius: "6px 6px 0 0", borderBottom: "2px solid transparent" }}>Preview</div>
            <iframe
              key={previewKey}
              srcDoc={srcdoc}
              style={{ flex: 1, border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px", background: "#fff" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
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
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            title="Page"
          />
        </div>
      )}
    </>
  );
}

const DEFAULT_BODY = `<div style="padding: 24px; max-width: 800px; margin: 0 auto">
  <h1>My Web Page</h1>
  <p>Edit this page to build your app. The IoT Stack SDK is available.</p>
  <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px">// Query data
const result = await IoTStack.query("SELECT * FROM my_table LIMIT 5");
console.log(result.rows);</pre>
  <div id="output" style="margin-top: 16px; padding: 12px; background: #f0f7ff; border-radius: 6px"></div>
</div>`;
const DEFAULT_HTML = DEFAULT_BODY;

// ─── Visual flow renderer (canvas-based) ─────────────────────────────────────
const BLOCK_TYPES = [
  { id: "data_source", label: "Data Source", icon: "\u{1F4BE}", color: "#0070f3" },
  { id: "generate", label: "Generate Data", icon: "\u{1F3B2}", color: "#8b5cf6" },
  { id: "filter", label: "Filter", icon: "\u{1F50D}", color: "#7c3aed" },
  { id: "transform", label: "Transform", icon: "\u2699", color: "#059669" },
  { id: "aggregate", label: "Aggregate", icon: "\u{1F4CA}", color: "#d97706" },
  { id: "insert", label: "Insert to DB", icon: "\u{1F4E5}", color: "#16a34a" },
  { id: "output", label: "Output", icon: "\u{1F4E4}", color: "#dc2626" },
  { id: "notify", label: "Notify", icon: "\u{1F514}", color: "#ec4899" },
];

const OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "contains", "is null", "is not null"];
const AGGREGATIONS = ["count", "sum", "avg", "min", "max"];
const TRANSFORMS = ["round", "uppercase", "lowercase", "abs", "to_number", "to_date"];
const OUTPUT_FORMATS = ["table", "json", "csv", "chart"];

function VisualRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const [tables, setTables] = useState([]);
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  const handleSave = async (nodes, edges) => {
    setSaving(true);
    await saveConfig({ ...cfg, nodes, edges });
    setSaving(false);
  };

  const handleRun = async (blockList) => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/flow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: blockList }),
      });
      const data = await res.json();
      setRunResult(data);
    } catch (e) {
      setRunResult({ error: e.message });
    }
    setRunning(false);
  };

  return (
    <FlowCanvas
      nodes={cfg.nodes || []}
      edges={cfg.edges || []}
      tables={tables}
      onSave={isOwner ? handleSave : undefined}
      onRun={handleRun}
      runResult={runResult}
      readOnly={!isOwner}
    />
  );
}

// Old linear block editor removed — FlowCanvas handles everything now

// ─── Notebook renderer (read-only HTML preview + Jupyter iframe) ─────────────

// Render markdown to HTML (basic: headings, bold, italic, code, links, lists)
function renderMarkdown(md) {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto;font-size:12px"><code>${code}</code></pre>`)
    // inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    // headings
    .replace(/^#### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="margin:8px 0 4px;font-size:15px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:10px 0 6px;font-size:16px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:12px 0 8px;font-size:18px">$1</h1>')
    // bold/italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#0070f3">$1</a>')
    // unordered lists
    .replace(/^[-*] (.+)$/gm, '<li style="margin:2px 0">$1</li>')
    // line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  // wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*(?:<br\/>)?)+)/g, '<ul style="margin:4px 0 4px 16px;padding:0">$1</ul>');
  return html;
}

// Render a notebook output object
function renderOutput(output) {
  if (!output) return null;
  const otype = output.output_type;
  if (otype === "stream") {
    return <pre style={{ margin: 0, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", color: output.name === "stderr" ? "#e53e3e" : "#333", whiteSpace: "pre-wrap", background: "#fafafa" }}>{(output.text || []).join("")}</pre>;
  }
  if (otype === "error") {
    return <pre style={{ margin: 0, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", color: "#e53e3e", whiteSpace: "pre-wrap", background: "#fff5f5" }}>{(output.traceback || []).join("\n").replace(/\x1b\[[0-9;]*m/g, "")}</pre>;
  }
  if (otype === "execute_result" || otype === "display_data") {
    const data = output.data || {};
    // HTML output
    if (data["text/html"]) {
      const html = Array.isArray(data["text/html"]) ? data["text/html"].join("") : data["text/html"];
      return <div style={{ padding: "4px 12px", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    // Image output
    if (data["image/png"]) {
      return <div style={{ padding: "4px 12px" }}><img src={`data:image/png;base64,${Array.isArray(data["image/png"]) ? data["image/png"].join("") : data["image/png"]}`} style={{ maxWidth: "100%" }} alt="output" /></div>;
    }
    if (data["image/svg+xml"]) {
      const svg = Array.isArray(data["image/svg+xml"]) ? data["image/svg+xml"].join("") : data["image/svg+xml"];
      return <div style={{ padding: "4px 12px", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: svg }} />;
    }
    // Plain text fallback
    if (data["text/plain"]) {
      const text = Array.isArray(data["text/plain"]) ? data["text/plain"].join("") : data["text/plain"];
      return <pre style={{ margin: 0, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#333", background: "#fafafa" }}>{text}</pre>;
    }
  }
  return null;
}

function NotebookRenderer({ page, isOwner }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const schedule = cfg.schedule;
  const lastRun = schedule?.last_run;
  const lastStatus = schedule?.last_status;

  const [jupyterUrl, setJupyterUrl] = useState(null);
  const [showJupyter, setShowJupyter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notebook, setNotebook] = useState(null);
  const [nbLoading, setNbLoading] = useState(true);
  const [nbError, setNbError] = useState("");
  const [collapsedCells, setCollapsedCells] = useState({});

  // Load notebook content for preview
  useEffect(() => {
    loadNotebookContent();
  }, [page.id]);

  const loadNotebookContent = async () => {
    setNbLoading(true);
    setNbError("");
    try {
      // Try config first (if notebook_content is stored inline)
      if (cfg.notebook_content) {
        const nb = typeof cfg.notebook_content === "string" ? JSON.parse(cfg.notebook_content) : cfg.notebook_content;
        setNotebook(nb);
        setNbLoading(false);
        return;
      }
      // Otherwise fetch via API
      const name = page.slug || page.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const res = await fetch(`/api/notebooks/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setNotebook(data.notebook || data);
      } else {
        setNbError("Notebook not yet created. Click 'Open in Jupyter' to create it.");
      }
    } catch (e) {
      setNbError("Could not load notebook preview.");
    }
    setNbLoading(false);
  };

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
    let url = data.url;
    if (window.location.port === "3000") {
      url = `http://${window.location.hostname}:8080${data.url}`;
    }
    setJupyterUrl(url);
    setShowJupyter(true);
    setLoading(false);
  };

  const toggleCell = (idx) => {
    setCollapsedCells((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Jupyter editor (full-screen iframe)
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
            {schedule?.cron && <span style={{ marginLeft: 12, color: "#fbbf24" }}>{"\u23F0"} {schedule.cron}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.open(jupyterUrl, "_blank")} style={toolbarBtn}>New tab</button>
            <button onClick={() => { setShowJupyter(false); loadNotebookContent(); }} style={toolbarBtn}>Back to preview</button>
          </div>
        </div>
        <iframe src={jupyterUrl} style={{ flex: 1, border: "none", width: "100%" }} title="JupyterLab" allow="clipboard-read; clipboard-write" />
      </div>
    );
  }

  const cells = notebook?.cells || [];

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {isOwner && (
          <button onClick={openNotebook} disabled={loading} style={btnBlue}>
            {loading ? "Starting..." : "Open in Jupyter"}
          </button>
        )}
        <button onClick={loadNotebookContent} style={btnGray}>Refresh</button>
        {error && <span style={{ color: "#e53e3e", fontSize: 13 }}>{error}</span>}
      </div>

      {/* Schedule info */}
      {schedule?.cron && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a", fontSize: 12 }}>
          <strong>{"\u23F0"} Scheduled:</strong> {schedule.cron}
          {schedule.enabled === false && <span style={{ color: "#999" }}> (paused)</span>}
          {lastRun && <span> &middot; Last run: {new Date(lastRun).toLocaleString()}</span>}
          {lastStatus && <span> &middot; <span style={{ color: lastStatus === "success" ? "#38a169" : "#e53e3e" }}>{lastStatus}</span></span>}
          {schedule.run_count > 0 && <span> &middot; {schedule.run_count} runs</span>}
        </div>
      )}

      {/* Notebook cells (read-only preview) */}
      {nbLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Loading notebook...</div>
      ) : nbError ? (
        <div style={{ padding: 24, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
          <p style={{ color: "#666", fontSize: 14 }}>{nbError}</p>
          {isOwner && (
            <button onClick={openNotebook} disabled={loading} style={btnBlue}>
              {loading ? "Starting..." : "Open in Jupyter"}
            </button>
          )}
        </div>
      ) : cells.length === 0 ? (
        <div style={{ padding: 24, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Empty notebook. {isOwner ? "Open in Jupyter to add cells." : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {cells.map((cell, idx) => {
            const cellType = cell.cell_type;
            const source = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
            const outputs = cell.outputs || [];
            const execCount = cell.execution_count;
            const isCollapsed = collapsedCells[idx];

            if (cellType === "markdown") {
              return (
                <div key={idx} style={{ padding: "12px 16px", background: "#fff", borderLeft: "3px solid #0070f3", borderRadius: 4 }}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
                </div>
              );
            }

            if (cellType === "code") {
              const sourceLines = source.split("\n");
              const isLong = sourceLines.length > 15;
              return (
                <div key={idx} style={{ background: "#fff", borderLeft: "3px solid #38a169", borderRadius: 4, overflow: "hidden" }}>
                  {/* Code cell header */}
                  <div style={{ display: "flex", alignItems: "center", padding: "4px 12px", background: "#f8f9fa", fontSize: 11, color: "#888", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", minWidth: 40 }}>[{execCount ?? " "}]:</span>
                    <span>{sourceLines.length} lines</span>
                    {isLong && (
                      <button onClick={() => toggleCell(idx)} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 11, padding: 0 }}>
                        {isCollapsed ? "Show code" : "Hide code"}
                      </button>
                    )}
                  </div>
                  {/* Source code */}
                  {!(isLong && isCollapsed) && (
                    <pre style={{
                      margin: 0, padding: "8px 12px 8px 52px", fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.5,
                      background: "#f7f7f7", overflow: "auto", maxHeight: 400, color: "#1e1e1e", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>{source}</pre>
                  )}
                  {/* Outputs */}
                  {outputs.length > 0 && (
                    <div style={{ borderTop: "1px solid #eee" }}>
                      {outputs.map((out, oi) => (
                        <div key={oi}>{renderOutput(out)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // raw or other cell types
            return (
              <div key={idx} style={{ padding: "8px 16px", background: "#f9f9f9", borderLeft: "3px solid #ccc", borderRadius: 4 }}>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{source}</pre>
              </div>
            );
          })}
        </div>
      )}

      {/* SDK quick reference (owner only, when no notebook loaded) */}
      {isOwner && cells.length === 0 && !nbLoading && (
        <div style={{ padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginTop: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>SDK Quick Reference</h3>
          <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto", lineHeight: 1.6, margin: 0 }}>
{`from iot_stack import connect
client = connect()

client.tables()                    # list tables
df = client.query_table("name")   # query → DataFrame
client.files.list()                # org files
client.notify("Title", message="") # send notification`}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Widget components (for dashboard) ────────────────────────────────────────
function WidgetConfig({ widget, tables, getTableCols, updateConfig }) {
  const { type, config } = widget;
  if (type === "text") return <textarea value={config?.text || ""} onChange={(e) => updateConfig("text", e.target.value)} style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, minHeight: 50, boxSizing: "border-box" }} />;
  if (type === "live") return (
    <div style={{ fontSize: 12 }}>
      <input placeholder="Channel name" value={config?.channel || ""} onChange={(e) => updateConfig("channel", e.target.value)} style={cfgInput} />
      <input placeholder="Data field to display" value={config?.field || ""} onChange={(e) => updateConfig("field", e.target.value)} style={cfgInput} />
      <select value={config?.display || "value"} onChange={(e) => updateConfig("display", e.target.value)} style={cfgInput}>
        <option value="value">Latest Value</option>
        <option value="chart">Live Chart</option>
        <option value="log">Message Log</option>
      </select>
    </div>
  );
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
  const { type, config } = widget;
  // Live widget — WebSocket subscription
  if (type === "live") return <LiveWidget config={config} />;
  if (!data) return <div style={{ color: "#ccc", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{data.error}</div>;
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
// ─── Live widget (WebSocket subscription) ─────────────────────────────────────
function LiveWidget({ config }) {
  const [value, setValue] = useState(null);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!config?.channel) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // WebSocket goes through nginx (8080), not the Next.js dev server (3000)
    const host = window.location.port === "3000" ? window.location.hostname + ":8080" : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/channels`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "subscribe", channel: config.channel }));
      setConnected(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.data) {
          const field = config.field || Object.keys(msg.data).find((k) => typeof msg.data[k] === "number");
          if (field && msg.data[field] !== undefined) {
            setValue(msg.data[field]);
            setHistory((prev) => [...prev.slice(-29), { t: new Date().toLocaleTimeString(), v: msg.data[field] }]);
          }
        }
      } catch {}
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [config?.channel, config?.field]);

  if (!config?.channel) return <div style={{ color: "#999", fontSize: 12 }}>Configure channel name</div>;

  const display = config.display || "value";

  if (display === "chart" && history.length > 0) {
    const max = Math.max(...history.map((h) => h.v), 1);
    const h = 80;
    return (
      <div>
        <div style={{ fontSize: 10, color: connected ? "#38a169" : "#999", marginBottom: 4 }}>
          {connected ? "\u25CF" : "\u25CB"} {config.channel} {config.field ? `(${config.field})` : ""}
        </div>
        <svg width="100%" height={h + 15} viewBox={`0 0 ${Math.max(history.length * 12, 100)} ${h + 15}`}>
          <polyline
            points={history.map((p, i) => `${i * 12 + 6},${h - (p.v / max) * h}`).join(" ")}
            fill="none" stroke="#0070f3" strokeWidth={1.5}
          />
          {history.length > 0 && (
            <text x={history.length * 12 - 6} y={h - (history[history.length - 1].v / max) * h - 4}
              fontSize={9} fill="#0070f3" textAnchor="end">{history[history.length - 1].v}</text>
          )}
        </svg>
      </div>
    );
  }

  if (display === "log") {
    return (
      <div>
        <div style={{ fontSize: 10, color: connected ? "#38a169" : "#999", marginBottom: 4 }}>
          {connected ? "\u25CF" : "\u25CB"} {config.channel}
        </div>
        <div style={{ fontSize: 10, fontFamily: "monospace", maxHeight: 120, overflow: "auto" }}>
          {history.slice(-10).reverse().map((h, i) => (
            <div key={i} style={{ color: "#666" }}>{h.t}: {h.v}</div>
          ))}
          {history.length === 0 && <div style={{ color: "#ccc" }}>Waiting...</div>}
        </div>
      </div>
    );
  }

  // Default: latest value
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: connected ? "#38a169" : "#999" }}>
        {connected ? "\u25CF" : "\u25CB"} {config.channel}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{value ?? "\u2014"}</div>
      {config.field && <div style={{ fontSize: 11, color: "#666" }}>{config.field}</div>}
    </div>
  );
}

// ─── Python renderer ──────────────────────────────────────────────────────────
function PythonRenderer({ page, isOwner, saveConfig }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const [code, setCode] = useState(cfg.code || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);

  const save = async () => {
    setSaving(true);
    await saveConfig({ ...cfg, code });
    setSaving(false);
  };

  const runOnce = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: page.id, action: "run_python", code }),
      });
      const data = await res.json();
      setOutput(data);
    } catch (e) {
      setOutput({ error: e.message });
    }
    setRunning(false);
  };

  const isService = cfg.is_service === true;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {isOwner && (
          editing
            ? <>
                <button onClick={() => { save(); setEditing(false); }} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={() => { setEditing(false); setCode(cfg.code || ""); }} style={btnGray}>Cancel</button>
              </>
            : <button onClick={() => setEditing(true)} style={btnBlue}>Edit Code</button>
        )}
        {isOwner && !isService && <button onClick={runOnce} disabled={running} style={btnGray}>{running ? "Running..." : "\u25B6 Run Once"}</button>}
        {isService && (
          <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 4, background: cfg.service_status === "running" ? "#f0fde8" : "#fef2f2", color: cfg.service_status === "running" ? "#15803d" : "#dc2626", fontWeight: 600 }}>
            {cfg.service_status === "running" ? "Service running — always-on" : "Service stopped"}
          </span>
        )}
      </div>

      {/* Code editor */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#666", padding: "6px 12px", background: "#f0f0f0", display: "flex", justifyContent: "space-between" }}>
          <span>Python {isService ? "(service)" : "(script)"}</span>
          <span style={{ color: "#999" }}>{code.split("\n").length} lines</span>
        </div>
        {editing ? (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%", minHeight: 400, padding: 12, fontFamily: "monospace", fontSize: 13, lineHeight: 1.5,
              border: "none", resize: "vertical", background: "#1e1e1e", color: "#d4d4d4", tabSize: 4, boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; setCode(code.slice(0, s) + "    " + code.slice(e.target.selectionEnd)); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 4; }, 0); }
            }}
          />
        ) : (
          <pre style={{
            margin: 0, padding: 12, fontFamily: "monospace", fontSize: 13, lineHeight: 1.5,
            background: "#1e1e1e", color: "#d4d4d4", overflow: "auto", maxHeight: 500, minHeight: 200,
          }}>{code || "# No code yet"}</pre>
        )}
      </div>

      {/* Run output */}
      {output && (
        <div style={{ marginTop: 12, background: "#0f172a", borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Output</div>
          {output.error && <div style={{ color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>{output.error}</div>}
          {output.stdout && <pre style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>{output.stdout}</pre>}
          {output.result && <pre style={{ color: "#4ade80", fontFamily: "monospace", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(output.result, null, 2)}</pre>}
        </div>
      )}

      {/* Service info */}
      {isService && (
        <div style={{ marginTop: 16, padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Service Info</h3>
          <div style={{ fontSize: 12, color: "#64748b", display: "grid", gap: 4 }}>
            <div>This code runs continuously as a managed service. The backend monitors it and restarts on crash.</div>
            <div>Available environment variables: <code>ORG_ID</code>, <code>ORG_SLUG</code>, <code>DATABASE_URL</code>, <code>MQTT_BROKER</code>, <code>MQTT_PORT</code>, <code>SERVICE_NAME</code>, <code>PAGE_ID</code></div>
            <div>Available libraries: <code>paho-mqtt</code>, <code>psycopg2</code>, <code>numpy</code>, <code>scipy</code></div>
          </div>
        </div>
      )}
    </>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGray = { padding: "8px 16px", background: "#f0f0f0", color: "#333", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const miniBtn = { padding: "1px 5px", background: "none", border: "1px solid #ddd", borderRadius: 2, cursor: "pointer", fontSize: 10, color: "#666" };
const sizeBtn = { padding: "1px 5px", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: "center" };
const cfgInput = { display: "block", width: "100%", padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 12, marginBottom: 4, boxSizing: "border-box" };
const toolbarBtn = { padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 };
