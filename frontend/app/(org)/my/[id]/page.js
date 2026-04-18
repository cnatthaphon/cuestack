"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";
import FlowCanvas from "../../../../lib/components/flow-canvas.js";
import ChartWidget, { PALETTE, getColor } from "../../../../lib/components/chart-widget.js";
import EnergyIntelligenceWidget from "../../../../lib/components/energy-widget.js";

// ─── Icon Picker ─────────────────────────────────────────────────────────────
const ICON_GROUPS = {
  "Data": ["📊", "📈", "📉", "🗂️", "💾", "🗃️", "📋", "📑"],
  "Code": ["🐍", "📓", "💻", "🖥️", "⚙️", "🔧", "🛠️", "📦"],
  "Visual": ["🧩", "🎨", "🖼️", "📐", "🔮", "🌐", "🗺️", "📍"],
  "IoT": ["📡", "🌡️", "💡", "🔌", "🔋", "📱", "🏭", "🤖"],
  "Analytics": ["🔬", "🧪", "🧮", "📏", "🎯", "🔍", "📊", "🧠"],
  "Status": ["✅", "⚡", "🔔", "⏰", "🚀", "🔥", "💎", "⭐"],
};

function IconPicker({ currentIcon, onSelect, pageType }) {
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, zIndex: 50, background: "#fff",
      borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 12,
      width: 260, border: "1px solid #e2e8f0",
    }}>
      {Object.entries(ICON_GROUPS).map(([group, icons]) => (
        <div key={group}>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, margin: "6px 0 3px", textTransform: "uppercase" }}>{group}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {icons.map((icon) => (
              <button key={icon} onClick={() => onSelect(icon)}
                style={{
                  fontSize: 18, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                  background: icon === currentIcon ? "#e0e7ff" : "transparent", border: "none", borderRadius: 6,
                  cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={(e) => e.target.style.background = "#f1f5f9"}
                onMouseLeave={(e) => e.target.style.background = icon === currentIcon ? "#e0e7ff" : "transparent"}
              >{icon}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page shell (shared across all page types) ───────────────────────────────
export default function PageViewer() {
  const { user, refresh, hasPermission } = useUser();
  const params = useParams();
  const router = useRouter();
  const [page, setPage] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [orgUsers, setOrgUsers] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    loadPage();
    fetch("/api/users").then((r) => r.ok ? r.json() : { users: [] }).then((d) => setOrgUsers(d.users || []));
  }, [params.id]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

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

  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconPickerRef = useRef(null);

  // Close icon picker on outside click
  useEffect(() => {
    const handler = (e) => { if (iconPickerRef.current && !iconPickerRef.current.contains(e.target)) setShowIconPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const updateIcon = async (icon) => {
    await fetch(`/api/pages/${params.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon }),
    });
    setShowIconPicker(false);
    loadPage();
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

  const menuAction = (fn) => { setShowMenu(false); fn(); };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }} ref={iconPickerRef}>
            <button
              onClick={() => isOwner && setShowIconPicker(!showIconPicker)}
              title={isOwner ? "Change icon" : ""}
              style={{ fontSize: 24, background: "none", border: "none", cursor: isOwner ? "pointer" : "default", padding: 0, lineHeight: 1 }}
            >{page.icon}</button>
            {showIconPicker && <IconPicker currentIcon={page.icon} onSelect={updateIcon} pageType={page.page_type} />}
          </div>
          <h1 style={{ margin: 0, fontSize: 20 }}>{page.name}</h1>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, ...({
            notebook: { background: "#fef3c7", color: "#92400e" },
            python: { background: "#dbeafe", color: "#1e40af" },
            visual: { background: "#ede9fe", color: "#5b21b6" },
            dashboard: { background: "#d1fae5", color: "#065f46" },
            html: { background: "#ffe4e6", color: "#9f1239" },
          }[page.page_type] || { background: "#f3f4f6", color: "#374151" }) }}>
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
        {/* ⋯ menu button */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button onClick={() => setShowMenu(!showMenu)} style={{ ...btnGray, padding: "6px 12px", fontSize: 16, lineHeight: 1 }} title="Actions">{"\u22EF"}</button>
          {showMenu && (
            <div style={{
              position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 200,
              background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              zIndex: 100, overflow: "hidden", fontSize: 13,
            }}>
              <button onClick={() => menuAction(async () => {
                await fetch("/api/pins", { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "pin", page_id: page.id, scope: "personal" }) });
                refresh();
              })} style={menuItem}>{"\u2B50"} Pin to sidebar</button>
              {isOwner && <button onClick={() => menuAction(() => { setShowShare(true); setShowSchedule(false); })} style={menuItem}>{"\u{1F517}"} Share</button>}
              {canSchedule && <button onClick={() => menuAction(() => { setShowSchedule(true); setShowShare(false); })} style={menuItem}>{"\u23F0"} Schedule</button>}
              {canService && (
                <button onClick={() => menuAction(async () => {
                  const next = { ...cfg, is_service: !isService };
                  if (!isService) next.service_status = "running";
                  else next.service_status = "stopped";
                  await saveConfig(next);
                  loadPage();
                })} style={menuItem}>
                  {isService ? "\u25A0 Stop Service" : "\u25B6 Run as Service"}
                </button>
              )}
              {!isOwner && <button onClick={() => menuAction(clonePage)} style={menuItem}>{"\u{1F4CB}"} Clone</button>}
              {isOwner && <>
                <div style={{ borderTop: "1px solid #f0f0f0", margin: "4px 0" }} />
                <button onClick={() => menuAction(deletePage)} style={{ ...menuItem, color: "#e53e3e" }}>{"\u{1F5D1}"} Delete</button>
              </>}
            </div>
          )}
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
  { label: "Every 1 min", value: "* * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 10 min", value: "*/10 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Daily 8 AM", value: "0 8 * * *" },
  { label: "Weekly Mon", value: "0 0 * * 1" },
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

  const quickSave = async (cronValue, isEnabled = true) => {
    setSaving(true);
    setCron(cronValue);
    setEnabled(isEnabled);
    if (cronValue && isEnabled) {
      // Reset counter when cron changes
      const resetCount = cronValue !== existing.cron;
      const newConfig = { ...cfg, schedule: {
        cron: cronValue, enabled: true, updated_at: new Date().toISOString(),
        ...(resetCount ? {} : { run_count: existing.run_count || 0, last_run: existing.last_run, last_status: existing.last_status }),
      }};
      await saveConfig(newConfig);
    } else {
      const newConfig = { ...cfg };
      delete newConfig.schedule;
      await saveConfig(newConfig);
    }
    setSaving(false);
    onReload();
  };

  const toggleEnabled = async () => {
    if (enabled && cron) {
      await quickSave(cron, false);
    } else if (cron) {
      await quickSave(cron, true);
    }
  };

  return (
    <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #e65100" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{"\u23F0"} Schedule — {page.page_type}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {cron && (
            <div onClick={toggleEnabled} style={{
              width: 40, height: 22, borderRadius: 11, cursor: "pointer", transition: "background 0.2s",
              background: enabled && existing.cron ? "#38a169" : "#cbd5e1", position: "relative",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2,
                left: enabled && existing.cron ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999" }}>{"\u2715"}</button>
        </div>
      </div>

      {/* Cron input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && cron.trim()) quickSave(cron.trim()); }}
          placeholder="* * * * *"
          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, fontFamily: "monospace" }}
        />
      </div>

      {/* Preset buttons — click to fill and save */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {CRON_PRESETS.map((p) => (
          <button key={p.value} onClick={() => quickSave(p.value)} disabled={saving} style={{
            padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
            border: cron === p.value && enabled ? "2px solid #e65100" : "1px solid #e2e8f0",
            background: cron === p.value && enabled ? "#fff3e0" : "#fafafa", fontWeight: cron === p.value ? 600 : 400,
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Status */}
      {existing.cron && (
        <div style={{ fontSize: 11, color: "#666", padding: 6, background: "#f7f7f7", borderRadius: 4 }}>
          {enabled ? "\u{1F7E2}" : "\u26AA"} <code>{existing.cron}</code>
          {existing.last_run && <span> · Last: {new Date(existing.last_run).toLocaleString()}</span>}
          {existing.last_status && <span> · <span style={{ color: existing.last_status === "success" ? "#38a169" : "#e53e3e" }}>{existing.last_status}</span></span>}
          {existing.next_run && <span> · Next: {new Date(existing.next_run).toLocaleString()}</span>}
          {existing.run_count > 0 && <span> · {existing.run_count} runs</span>}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard renderer (widget grid) ─────────────────────────────────────────
const WIDGET_TYPES = [
  { id: "stat", label: "Stat", icon: "\u{1F522}" },
  { id: "chart", label: "Chart", icon: "\u{1F4C8}" },
  { id: "gauge", label: "Gauge", icon: "\u{1F3AF}" },
  { id: "compute", label: "Compute", icon: "\u26A1" },
  { id: "table", label: "Table", icon: "\u{1F4CB}" },
  { id: "slider", label: "Slider", icon: "\u{1F39A}\uFE0F" },
  { id: "select", label: "Select", icon: "\u{1F50D}" },
  { id: "text", label: "Text", icon: "\u{1F4DD}" },
  { id: "live", label: "Live", icon: "\u{1F4E1}" },
];

const CHART_TYPES = [
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
  { id: "area", label: "Area" },
  { id: "scatter", label: "Scatter" },
  { id: "pie", label: "Pie" },
  { id: "doughnut", label: "Doughnut" },
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

  // ─── Event bus: control widgets publish state, data widgets consume it ────
  // controlState = { "widget_key": value, ... } — keyed by control widget's var_name
  const [controlState, setControlState] = useState({});
  const controlStateRef = useRef(controlState);
  controlStateRef.current = controlState;

  // Initialize control defaults from widget configs
  useEffect(() => {
    const defaults = {};
    for (const w of widgets) {
      if (w.type === "slider" && w.config?.var_name) {
        defaults[w.config.var_name] = w.config?.default_value ?? w.config?.min ?? 0;
      }
      if (w.type === "select" && w.config?.var_name) {
        defaults[w.config.var_name] = w.config?.default_value ?? "";
      }
    }
    if (Object.keys(defaults).length > 0) {
      setControlState((prev) => ({ ...defaults, ...prev }));
    }
  }, [widgets.length]);

  // When a control changes, re-fetch data widgets that depend on it
  const onControlChange = useCallback((varName, value) => {
    setControlState((prev) => {
      const next = { ...prev, [varName]: value };
      // Re-fetch data widgets (debounced below)
      setTimeout(() => reloadDependentWidgets(next), 50);
      return next;
    });
  }, [widgets]);

  const reloadDependentWidgets = async (state) => {
    const data = { ...widgetData };
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      // Skip control + text + live widgets
      if (["slider", "select", "text", "live"].includes(w.type)) continue;
      // Check if this widget has any filter bindings
      const filters = w.config?.filters || [];
      const hasDeps = filters.some((f) => f.var_name && state[f.var_name] !== undefined);
      if (!hasDeps && !w.config?.limit_var) continue;
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w, controlState: state }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData({ ...data });
  };

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

  const loadWidgetData = async (w, state) => {
    const s = state || controlStateRef.current;
    const data = {};
    for (let i = 0; i < w.length; i++) {
      if (["slider", "select"].includes(w[i].type)) continue;
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w[i], controlState: s }),
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
    if (type === "chart") { w.config = { chart_type: "line", series: [], show_legend: true }; w.colSpan = 2; w.rowSpan = 2; }
    if (type === "gauge") w.config = { label: "Value", min: 0, max: 100, aggregation: "avg", thresholds: [{ value: 70, color: "#f59e0b" }, { value: 90, color: "#ef4444" }] };
    if (type === "compute") { w.config = { formula: "energy_all", model_config: {}, output_table: "", display: "cards" }; w.colSpan = 2; w.rowSpan = 2; }
    if (type === "slider") w.config = { var_name: "", label: "Control", min: 0, max: 100, step: 1, default_value: 50, unit: "" };
    if (type === "select") w.config = { var_name: "", label: "Filter", options: [], source_table: "", source_column: "" };
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
                    {"\u2630"} {(WIDGET_TYPES.find((t) => t.id === w.type) || WIDGET_TYPES.find((t) => t.id === "chart"))?.icon} {(WIDGET_TYPES.find((t) => t.id === w.type) || { label: "Chart" }).label}
                    {w.type === "chart" && w.config?.chart_type && <span style={{ color: "#cbd5e1", marginLeft: 4 }}>({w.config.chart_type})</span>}
                    <span style={{ color: "#cbd5e1", marginLeft: 6, fontSize: 9 }}>{cs}x{rs}</span>
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); removeWidget(i); }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}
                    title="Remove widget">{"\u00D7"}</button>
                </div>
              )}

              {/* Widget content or config */}
              {editing && editIdx === i ? (
                <WidgetConfig widget={w} tables={tables} getTableCols={getTableCols} updateConfig={(k, v) => updateConfig(i, k, v)}
                  updateWidget={(updates) => setWidgets(widgets.map((ww, ii) => ii === i ? { ...ww, ...updates } : ww))}
                  widgets={widgets} />
              ) : (
                <WidgetView widget={w} data={widgetData[i]?.data} controlState={controlState} onControlChange={onControlChange} />
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
  <p>Edit this page to build your app. The CueStack SDK is available.</p>
  <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px">// Query data
const result = await CueStack.query("SELECT * FROM my_table LIMIT 5");
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
    return <pre style={{ margin: 0, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", color: output.name === "stderr" ? "#e53e3e" : "#333", whiteSpace: "pre-wrap", background: "#fafafa" }}>{Array.isArray(output.text) ? output.text.join("") : (output.text || "")}</pre>;
  }
  if (otype === "error") {
    return <pre style={{ margin: 0, padding: "4px 12px", fontSize: 12, fontFamily: "monospace", color: "#e53e3e", whiteSpace: "pre-wrap", background: "#fff5f5" }}>{(output.traceback || []).join("\n").replace(/\x1b\[[0-9;]*m/g, "")}</pre>;
  }
  if (otype === "execute_result" || otype === "display_data") {
    const data = output.data || {};
    // HTML output — use iframe for interactive content (Plotly, Bokeh, etc.)
    if (data["text/html"]) {
      const html = Array.isArray(data["text/html"]) ? data["text/html"].join("") : data["text/html"];
      const hasScript = html.includes("<script") || html.includes("plotly") || html.includes("bokeh");
      if (hasScript) {
        const srcdoc = `<!DOCTYPE html><html><head><style>body{margin:0;font-family:system-ui;}</style></head><body>${html}</body></html>`;
        return <div style={{ padding: "4px 12px" }}><iframe srcDoc={srcdoc} style={{ width: "100%", minHeight: 420, border: "1px solid #e2e8f0", borderRadius: 6 }} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" /></div>;
      }
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

function NotebookRenderer({ page, isOwner, saveConfig, onReload }) {
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
  const schedule = cfg.schedule;
  const lastRun = schedule?.last_run;
  const lastStatus = schedule?.last_status;

  // DB is source of truth — notebook_content stored in page config
  const nbContent = cfg.notebook_content || null;
  const notebook = nbContent && typeof nbContent === "string" ? JSON.parse(nbContent) : nbContent;
  const cells = notebook?.cells || [];

  const [jupyterUrl, setJupyterUrl] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [collapsedCells, setCollapsedCells] = useState({});
  // Hide code: non-owners always start hidden, owners respect saved preference
  const defaultHide = !isOwner || cfg.hide_code === true;
  const [hideCode, setHideCode] = useState(defaultHide);
  const [showLogs, setShowLogs] = useState(false);
  const [taskLogs, setTaskLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchTaskLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${page.id}`);
      if (res.ok) {
        const d = await res.json();
        setTaskLogs(d.logs || []);
      }
    } catch (e) { console.error("Failed to fetch task logs", e); }
    setLogsLoading(false);
  }, [page.id]);

  const nbName = page.slug || page.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Migration: if DB has no content, try pulling from Jupyter (old notebooks)
  useEffect(() => {
    if (!nbContent && page.id) {
      fetch(`/api/notebooks/${encodeURIComponent(nbName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: page.id }),
      }).then((r) => { if (r.ok && onReload) onReload(); }).catch(() => {});
    }
  }, [page.id]);

  // Auto-refresh: poll for new execution results on scheduled pages
  const lastRunCountRef = useRef(schedule?.run_count || 0);
  // Keep ref in sync when page data reloads
  useEffect(() => { lastRunCountRef.current = schedule?.run_count || 0; }, [schedule?.run_count]);
  useEffect(() => {
    if (!schedule?.enabled || !schedule?.cron) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pages/${page.id}`);
        if (!res.ok) return;
        const d = await res.json();
        const newCfg = typeof d.page?.config === "string" ? JSON.parse(d.page.config) : (d.page?.config || {});
        const newRunCount = newCfg.schedule?.run_count || 0;
        if (newRunCount > lastRunCountRef.current) {
          lastRunCountRef.current = newRunCount;
          if (onReload) onReload();
          fetchTaskLogs();
        }
      } catch {}
    }, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [page.id, schedule?.enabled]);

  // Open: push content from DB → Jupyter, open editor
  const openNotebook = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: page.id, name: nbName }),
    });
    if (!res.ok) { setError((await res.json()).error); setLoading(false); return; }
    const data = await res.json();
    let url = data.url;
    if (window.location.port === "3000") {
      url = `http://${window.location.hostname}:8080${data.url}`;
    }
    setJupyterUrl(url);
    setEditing(true);
    setLoading(false);
  };

  // Pull notebook content from Jupyter → DB (saves current state to platform)
  const syncToDb = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(nbName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: page.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to sync");
      }
    } catch {
      setError("Failed to sync notebook");
    }
    setSaving(false);
  };

  // Close editor — confirm, sync to DB, return to preview
  const closeEditor = async () => {
    const ok = confirm("Close notebook?\n\nMake sure you pressed Ctrl+S first — unsaved edits won't be synced.");
    if (!ok) return;
    await syncToDb();
    setEditing(false);
    if (onReload) onReload();
  };

  const toggleCell = (idx) => {
    setCollapsedCells((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Jupyter editor — full viewport overlay (hides sidebar + header completely)
  if (editing && jupyterUrl) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", background: "#1a1a2e" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 16px", background: "#1a1a2e", color: "#fff", fontSize: 13, flexShrink: 0,
          borderBottom: "1px solid #2d2d44",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{page.icon}</span>
            <strong>{page.name}</strong>
            {schedule?.cron && <span style={{ color: "#fbbf24", fontSize: 11 }}>{"\u23F0"} {schedule.cron}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Ctrl+S to save</span>
            <button onClick={closeEditor} disabled={saving} style={{ ...toolbarBtn, background: saving ? "#64748b" : "#ef4444" }}>
              {saving ? "Syncing..." : "Close"}
            </button>
          </div>
        </div>
        <iframe src={jupyterUrl} style={{ flex: 1, border: "none", width: "100%" }} title="JupyterLab" allow="clipboard-read; clipboard-write" />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {isOwner && (
          <button onClick={openNotebook} disabled={loading} style={btnBlue}>
            {loading ? "Starting..." : cells.length > 0 ? "Edit in Jupyter" : "Create Notebook"}
          </button>
        )}
        {error && <span style={{ color: "#e53e3e", fontSize: 13 }}>{error}</span>}
        {cells.length > 0 && (
          <button onClick={() => {
            const next = !hideCode;
            setHideCode(next);
            // Owner: save preference to page config
            if (isOwner) saveConfig({ ...cfg, hide_code: next });
          }} style={{ ...toolbarBtn, background: hideCode ? "#38a169" : "#e2e8f0", color: hideCode ? "#fff" : "#333" }}>
            {hideCode ? "Show Code" : "Hide Code"}
          </button>
        )}
        {cells.length > 0 && <span style={{ fontSize: 11, color: "#999" }}>{cells.length} cells</span>}
      </div>

      {/* Schedule info */}
      {schedule?.cron && (
        <div style={{ marginBottom: 12, background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a", fontSize: 12 }}>
          <div style={{ padding: 10 }}>
            <strong>{"\u23F0"} Scheduled:</strong> {schedule.cron}
            {schedule.enabled === false && <span style={{ color: "#999" }}> (paused)</span>}
            {lastRun && <span> · Last: {new Date(lastRun).toLocaleString()}</span>}
            {lastStatus && <span> · <span style={{ color: lastStatus === "success" ? "#38a169" : "#e53e3e" }}>{lastStatus}</span></span>}
            {schedule.next_run && <span> · Next: {new Date(schedule.next_run).toLocaleString()}</span>}
            {schedule.run_count > 0 && <span> · {schedule.run_count} runs</span>}
            {lastStatus === "error" && schedule.last_message && (
              <span style={{ color: "#e53e3e" }}> · {schedule.last_message.length > 200 ? (
                <>{schedule.last_message.slice(0, 200)}<button onClick={() => alert(schedule.last_message)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12, padding: "0 2px", textDecoration: "underline" }}>...</button></>
              ) : schedule.last_message}</span>
            )}
            <button
              onClick={() => { const next = !showLogs; setShowLogs(next); if (next && !taskLogs) fetchTaskLogs(); }}
              style={{ marginLeft: 8, background: showLogs ? "#f59e0b" : "#fde68a", border: "1px solid #f59e0b", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11, color: showLogs ? "#fff" : "#92400e" }}
            >
              {showLogs ? "Hide Logs" : "View Logs"}
            </button>
          </div>
          {showLogs && (
            <div style={{ padding: "0 10px 10px", borderTop: "1px solid #fde68a", maxHeight: 260, overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 6px" }}>
                <strong style={{ fontSize: 11 }}>Recent Runs</strong>
                <button onClick={fetchTaskLogs} disabled={logsLoading} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 11, padding: 0 }}>
                  {logsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              {logsLoading && !taskLogs ? (
                <div style={{ color: "#999", padding: 8 }}>Loading logs...</div>
              ) : taskLogs && taskLogs.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #fde68a", textAlign: "left" }}>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Time</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Duration</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Message</th>
                      <th style={{ padding: "4px 6px", fontWeight: 600 }}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #fef3c7" }}>
                        <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                        <td style={{ padding: "3px 6px" }}>
                          <span style={{ color: log.status === "success" ? "#38a169" : "#e53e3e", fontWeight: 600 }}>{log.status}</span>
                        </td>
                        <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>{log.duration_ms != null ? (log.duration_ms / 1000).toFixed(1) + "s" : "—"}</td>
                        <td style={{ padding: "3px 6px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.message || ""}>
                          {log.message ? (log.message.length > 80 ? log.message.slice(0, 80) + "..." : log.message) : "—"}
                        </td>
                        <td style={{ padding: "3px 6px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e53e3e" }} title={log.error || ""}>
                          {log.error ? (log.error.length > 80 ? log.error.slice(0, 80) + "..." : log.error) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: "#999", padding: 8 }}>No run logs found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notebook preview — rendered from DB content */}
      {cells.length === 0 ? (
        <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📓</div>
          <p style={{ color: "#999", margin: "0 0 16px" }}>
            {nbContent ? "Empty notebook." : "No notebook content yet. Click above to create one."}
          </p>
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
              // When code is hidden, skip cells with no outputs
              if (hideCode && outputs.length === 0) return null;
              const sourceLines = source.split("\n");
              const isLong = sourceLines.length > 15;
              const showSource = !hideCode;
              return (
                <div key={idx} style={{ background: "#fff", borderLeft: "3px solid #38a169", borderRadius: 4, overflow: "hidden" }}>
                  {showSource && (
                    <div style={{ display: "flex", alignItems: "center", padding: "4px 12px", background: "#f8f9fa", fontSize: 11, color: "#888", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", minWidth: 40 }}>[{execCount ?? " "}]:</span>
                      <span>{sourceLines.length} lines</span>
                      {isLong && (
                        <button onClick={() => toggleCell(idx)} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 11, padding: 0 }}>
                          {isCollapsed ? "Show code" : "Hide code"}
                        </button>
                      )}
                    </div>
                  )}
                  {showSource && !(isLong && isCollapsed) && (
                    <pre style={{
                      margin: 0, padding: "8px 12px 8px 52px", fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.5,
                      background: "#f7f7f7", overflow: "auto", maxHeight: 400, color: "#1e1e1e", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>{source}</pre>
                  )}
                  {outputs.length > 0 && (
                    <div style={{ borderTop: showSource ? "1px solid #eee" : "none" }}>
                      {outputs.map((out, oi) => (
                        <div key={oi}>{renderOutput(out)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={idx} style={{ padding: "8px 16px", background: "#f9f9f9", borderLeft: "3px solid #ccc", borderRadius: 4 }}>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{source}</pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Widget components (for dashboard) ────────────────────────────────────────
function WidgetConfig({ widget, tables, getTableCols, updateConfig, updateWidget, widgets }) {
  const { type, config } = widget;

  // ─── Slider config ─────────────────────────────────────────────────────
  if (type === "slider") return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      <input placeholder="Variable name (e.g. limit)" value={config?.var_name || ""} onChange={(e) => updateConfig("var_name", e.target.value.replace(/[^a-z0-9_]/g, ""))} style={cfgInput} />
      <input placeholder="Label" value={config?.label || ""} onChange={(e) => updateConfig("label", e.target.value)} style={cfgInput} />
      <div style={{ display: "flex", gap: 4 }}>
        <input type="number" placeholder="Min" value={config?.min ?? 0} onChange={(e) => updateConfig("min", parseFloat(e.target.value) || 0)} style={{ ...cfgInput, flex: 1 }} />
        <input type="number" placeholder="Max" value={config?.max ?? 100} onChange={(e) => updateConfig("max", parseFloat(e.target.value) || 100)} style={{ ...cfgInput, flex: 1 }} />
        <input type="number" placeholder="Step" value={config?.step ?? 1} onChange={(e) => updateConfig("step", parseFloat(e.target.value) || 1)} style={{ ...cfgInput, flex: 1 }} />
      </div>
      <input type="number" placeholder="Default" value={config?.default_value ?? 50} onChange={(e) => updateConfig("default_value", parseFloat(e.target.value) || 0)} style={cfgInput} />
      <input placeholder="Unit (e.g. °C, %, rows)" value={config?.unit || ""} onChange={(e) => updateConfig("unit", e.target.value)} style={cfgInput} />
    </div>
  );

  // ─── Select config ─────────────────────────────────────────────────────
  if (type === "select") {
    const options = config?.options || [];
    return (
      <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <input placeholder="Variable name (e.g. channel)" value={config?.var_name || ""} onChange={(e) => updateConfig("var_name", e.target.value.replace(/[^a-z0-9_]/g, ""))} style={cfgInput} />
        <input placeholder="Label" value={config?.label || ""} onChange={(e) => updateConfig("label", e.target.value)} style={cfgInput} />
        <div style={{ borderTop: "1px solid #eee", paddingTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "#555" }}>Options</span>
            <button onClick={() => updateConfig("options", [...options, ""])} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "#f9fafb" }}>+ Add</button>
          </div>
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginBottom: 2 }}>
              <input value={typeof o === "string" ? o : o.value || ""} placeholder="Value"
                onChange={(e) => { const next = [...options]; next[i] = e.target.value; updateConfig("options", next); }}
                style={{ ...cfgInput, flex: 1, marginBottom: 0 }} />
              <button onClick={() => updateConfig("options", options.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>{"\u00D7"}</button>
            </div>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#666" }}>
          <input type="checkbox" checked={config?.show_all !== false} onChange={(e) => updateConfig("show_all", e.target.checked)} /> Show "All" option
        </label>
      </div>
    );
  }

  // ─── Compute config ─────────────────────────────────────────────────────
  if (type === "compute") {
    const inputMap = config?.input_map || {};
    const controlWidgets = (widgets || []).filter((w) => (w.type === "slider" || w.type === "select") && w.config?.var_name);
    const FORMULA_INPUTS = ["Ti", "Te", "setpoint", "hours", "rate", "hours_away"];

    return (
      <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <select value={config?.formula || "energy_all"} onChange={(e) => updateConfig("formula", e.target.value)} style={cfgInput}>
          <option value="energy_all">What-If Predictor</option>
          <option value="energy_compare">Energy Intelligence (actual vs predicted)</option>
        </select>
        {config?.formula === "energy_compare" && (
          <input placeholder="Source table (e.g. power_consumption)" value={config?.source_table || ""}
            onChange={(e) => updateConfig("source_table", e.target.value)} style={cfgInput} />
        )}

        {/* Model config — paste JSON or load from file */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 4 }}>
          <div style={{ fontWeight: 600, color: "#555", marginBottom: 4 }}>Model Parameters</div>
          <textarea
            value={JSON.stringify(config?.model_config || {}, null, 2)}
            onChange={(e) => { try { updateConfig("model_config", JSON.parse(e.target.value)); } catch {} }}
            placeholder='Paste ac_model_config.json here'
            style={{ width: "100%", minHeight: 60, padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 10, fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" }}
          />
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            {Object.keys(config?.model_config || {}).length} params loaded
          </div>
        </div>

        {/* Input mapping — bind formula inputs to control widgets */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 4 }}>
          <div style={{ fontWeight: 600, color: "#555", marginBottom: 4 }}>Input Bindings</div>
          {FORMULA_INPUTS.map((key) => (
            <div key={key} style={{ display: "flex", gap: 4, marginBottom: 3, alignItems: "center" }}>
              <span style={{ minWidth: 70, fontSize: 11, color: "#555" }}>{key}</span>
              <select value={inputMap[key] || ""} onChange={(e) => updateConfig("input_map", { ...inputMap, [key]: e.target.value })}
                style={{ ...cfgInput, flex: 1, marginBottom: 0, fontSize: 11 }}>
                <option value="">— default —</option>
                {controlWidgets.map((cw) => <option key={cw.config.var_name} value={cw.config.var_name}>{cw.config.label || cw.config.var_name}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Output table */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 4 }}>
          <input placeholder="Output table (optional, e.g. energy_predictions)" value={config?.output_table || ""}
            onChange={(e) => updateConfig("output_table", e.target.value)} style={cfgInput} />
          <div style={{ fontSize: 10, color: "#94a3b8" }}>Results persist in this table for other widgets</div>
        </div>
      </div>
    );
  }

  // ─── Gauge config ──────────────────────────────────────────────────────
  if (type === "gauge") {
    const thresholds = config?.thresholds || [];
    return (
      <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <input placeholder="Label" value={config?.label || ""} onChange={(e) => updateConfig("label", e.target.value)} style={cfgInput} />
        <select value={config?.table || ""} onChange={(e) => updateConfig("table", e.target.value)} style={cfgInput}>
          <option value="">Select table...</option>
          {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {config?.table && (
          <div style={{ display: "flex", gap: 4 }}>
            <select value={config?.column || ""} onChange={(e) => updateConfig("column", e.target.value)} style={{ ...cfgInput, flex: 1 }}>
              <option value="">(count)</option>
              {getTableCols(config.table).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={config?.aggregation || "avg"} onChange={(e) => updateConfig("aggregation", e.target.value)} style={{ ...cfgInput, flex: 1 }}>
              {["count", "avg", "sum", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 4 }}>
          <input type="number" placeholder="Min" value={config?.min ?? 0} onChange={(e) => updateConfig("min", parseFloat(e.target.value) || 0)} style={{ ...cfgInput, flex: 1 }} />
          <input type="number" placeholder="Max" value={config?.max ?? 100} onChange={(e) => updateConfig("max", parseFloat(e.target.value) || 100)} style={{ ...cfgInput, flex: 1 }} />
        </div>
        <input placeholder="Unit" value={config?.unit || ""} onChange={(e) => updateConfig("unit", e.target.value)} style={cfgInput} />
        <div style={{ borderTop: "1px solid #eee", paddingTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "#555" }}>Thresholds</span>
            <button onClick={() => updateConfig("thresholds", [...thresholds, { value: 70, color: "#f59e0b" }])} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "#f9fafb" }}>+</button>
          </div>
          {thresholds.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginBottom: 2, alignItems: "center" }}>
              <input type="color" value={t.color || "#f59e0b"} onChange={(e) => { const next = [...thresholds]; next[i] = { ...t, color: e.target.value }; updateConfig("thresholds", next); }}
                style={{ width: 24, height: 24, padding: 0, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer" }} />
              <input type="number" value={t.value} placeholder="Value" onChange={(e) => { const next = [...thresholds]; next[i] = { ...t, value: parseFloat(e.target.value) || 0 }; updateConfig("thresholds", next); }}
                style={{ ...cfgInput, flex: 1, marginBottom: 0 }} />
              <button onClick={() => updateConfig("thresholds", thresholds.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>{"\u00D7"}</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

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

  // ─── Chart config with series builder ──────────────────────────────────
  if (type === "chart" || ["line", "bar", "pie", "doughnut", "area", "scatter"].includes(type)) {
    const chartType = config?.chart_type || type || "line";
    const series = config?.series || [];
    const cols = config?.table ? getTableCols(config.table) : [];
    const isPie = chartType === "pie" || chartType === "doughnut";

    const addSeries = () => {
      const newSeries = [...series, { y_column: "", label: "", color: getColor(series.length) }];
      updateConfig("series", newSeries);
    };
    const removeSeries = (idx) => {
      updateConfig("series", series.filter((_, i) => i !== idx));
    };
    const updateSeries = (idx, key, val) => {
      updateConfig("series", series.map((s, i) => i === idx ? { ...s, [key]: val } : s));
    };

    return (
      <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <input placeholder="Chart title" value={config?.title || ""} onChange={(e) => updateConfig("title", e.target.value)} style={cfgInput} />

        {/* Chart type selector */}
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {CHART_TYPES.map((ct) => (
            <button key={ct.id} onClick={() => updateConfig("chart_type", ct.id)}
              style={{ padding: "3px 8px", fontSize: 11, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer",
                background: chartType === ct.id ? "#3b82f6" : "#fff", color: chartType === ct.id ? "#fff" : "#333" }}>
              {ct.label}
            </button>
          ))}
        </div>

        {/* Data source */}
        <select value={config?.table || ""} onChange={(e) => updateConfig("table", e.target.value)} style={cfgInput}>
          <option value="">Select table...</option>
          {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>

        {config?.table && (
          <>
            {/* X axis */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ color: "#666", minWidth: 14 }}>X</span>
              <select value={config?.x_column || "created_at"} onChange={(e) => updateConfig("x_column", e.target.value)} style={{ ...cfgInput, flex: 1 }}>
                {cols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Series list */}
            <div style={{ borderTop: "1px solid #eee", paddingTop: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "#555" }}>{isPie ? "Value" : "Series"}</span>
                <button onClick={addSeries} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "#f9fafb" }}>+ Add</button>
              </div>
              {series.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                  <input type="color" value={s.color || getColor(i)} onChange={(e) => updateSeries(i, "color", e.target.value)}
                    style={{ width: 24, height: 24, padding: 0, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer" }} />
                  <select value={s.y_column || ""} onChange={(e) => updateSeries(i, "y_column", e.target.value)} style={{ ...cfgInput, flex: 1 }}>
                    <option value="">column...</option>
                    {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Label" value={s.label || ""} onChange={(e) => updateSeries(i, "label", e.target.value)}
                    style={{ ...cfgInput, flex: 1 }} />
                  <button onClick={() => removeSeries(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>{"\u00D7"}</button>
                </div>
              ))}
              {series.length === 0 && <div style={{ color: "#ccc", fontSize: 11, padding: 4 }}>No series yet — click + Add</div>}
            </div>

            {/* Chart options */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #eee", paddingTop: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#666" }}>
                <input type="checkbox" checked={config?.show_legend !== false} onChange={(e) => updateConfig("show_legend", e.target.checked)} /> Legend
              </label>
              {!isPie && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#666" }}>
                    <input type="checkbox" checked={!!config?.stacked} onChange={(e) => updateConfig("stacked", e.target.checked)} /> Stacked
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#666" }}>
                    <input type="checkbox" checked={!!config?.fill} onChange={(e) => updateConfig("fill", e.target.checked)} /> Fill
                  </label>
                </>
              )}
            </div>

            {/* Axis labels */}
            {!isPie && (
              <div style={{ display: "flex", gap: 4 }}>
                <input placeholder="X axis label" value={config?.x_label || ""} onChange={(e) => updateConfig("x_label", e.target.value)} style={{ ...cfgInput, flex: 1 }} />
                <input placeholder="Y axis label" value={config?.y_label || ""} onChange={(e) => updateConfig("y_label", e.target.value)} style={{ ...cfgInput, flex: 1 }} />
              </div>
            )}

            {/* Limit */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Rows:</span>
              <input type="number" min={10} max={1000} value={config?.limit || 200} onChange={(e) => updateConfig("limit", parseInt(e.target.value) || 200)}
                style={{ ...cfgInput, width: 70 }} />
            </div>

            {/* Filter bindings */}
            {(() => {
              const cws = (widgets || []).filter((w) => (w.type === "slider" || w.type === "select") && w.config?.var_name);
              return cws.length > 0 ? (
                <FilterBindings filters={config?.filters || []} updateConfig={updateConfig}
                  controlWidgets={cws} columns={cols} />
              ) : null;
            })()}
          </>
        )}
      </div>
    );
  }

  // ─── Stat / Table config ─────────────────────────────────────────────────
  // Find available control widgets for filter binding
  const controlWidgets = (widgets || []).filter((w) => (w.type === "slider" || w.type === "select") && w.config?.var_name);
  const filters = config?.filters || [];

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
      {/* Filter bindings — connect to control widgets */}
      {config?.table && controlWidgets.length > 0 && (
        <FilterBindings filters={filters} updateConfig={updateConfig}
          controlWidgets={controlWidgets} columns={getTableCols(config.table)} />
      )}
    </div>
  );
}

// ─── Shared: Filter binding UI (connects data widgets to control widgets) ────
function FilterBindings({ filters, updateConfig, controlWidgets, columns }) {
  const addFilter = () => updateConfig("filters", [...filters, { column: "", op: "eq", var_name: "" }]);
  const removeFilter = (idx) => updateConfig("filters", filters.filter((_, i) => i !== idx));
  const updateFilter = (idx, key, val) => updateConfig("filters", filters.map((f, i) => i === idx ? { ...f, [key]: val } : f));

  return (
    <div style={{ borderTop: "1px solid #eee", paddingTop: 6, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: "#555", fontSize: 11 }}>Filter by controls</span>
        <button onClick={addFilter} style={{ fontSize: 10, padding: "2px 6px", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", background: "#f9fafb" }}>+ Bind</button>
      </div>
      {filters.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 3, marginBottom: 3, alignItems: "center" }}>
          <select value={f.column || ""} onChange={(e) => updateFilter(i, "column", e.target.value)} style={{ ...cfgInput, flex: 1, marginBottom: 0, fontSize: 11 }}>
            <option value="">Column...</option>
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.op || "eq"} onChange={(e) => updateFilter(i, "op", e.target.value)} style={{ ...cfgInput, width: 50, marginBottom: 0, fontSize: 11 }}>
            <option value="eq">=</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="gte">&ge;</option>
            <option value="lte">&le;</option>
            <option value="contains">contains</option>
          </select>
          <select value={f.var_name || ""} onChange={(e) => updateFilter(i, "var_name", e.target.value)} style={{ ...cfgInput, flex: 1, marginBottom: 0, fontSize: 11 }}>
            <option value="">Control...</option>
            {controlWidgets.map((cw) => <option key={cw.config.var_name} value={cw.config.var_name}>{cw.config.label || cw.config.var_name}</option>)}
          </select>
          <button onClick={() => removeFilter(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: 0 }}>{"\u00D7"}</button>
        </div>
      ))}
      {filters.length === 0 && <div style={{ color: "#ccc", fontSize: 10 }}>No filters — add to bind controls to this widget</div>}
    </div>
  );
}

function WidgetView({ widget, data, controlState, onControlChange }) {
  const { type, config } = widget;

  // ─── Slider control ──────────────────────────────────────────────────────
  if (type === "slider") {
    const varName = config?.var_name;
    const val = varName && controlState?.[varName] !== undefined ? controlState[varName] : (config?.default_value ?? config?.min ?? 0);
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{config?.label || "Control"}</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0070f3" }}>{val}{config?.unit ? <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 2 }}>{config.unit}</span> : null}</span>
        </div>
        <input type="range" min={config?.min ?? 0} max={config?.max ?? 100} step={config?.step ?? 1} value={val}
          onChange={(e) => varName && onControlChange?.(varName, parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: "#0070f3", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
          <span>{config?.min ?? 0}</span>
          <span>{config?.max ?? 100}</span>
        </div>
      </div>
    );
  }

  // ─── Select control ──────────────────────────────────────────────────────
  if (type === "select") {
    const varName = config?.var_name;
    const val = varName && controlState?.[varName] !== undefined ? controlState[varName] : (config?.default_value ?? "");
    const options = config?.options || [];
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>{config?.label || "Filter"}</div>
        <select value={val} onChange={(e) => varName && onControlChange?.(varName, e.target.value)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, background: "#fff", cursor: "pointer" }}>
          {config?.show_all !== false && <option value="">All</option>}
          {options.map((o, i) => <option key={i} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
        </select>
      </div>
    );
  }

  // ─── Gauge widget ────────────────────────────────────────────────────────
  if (type === "gauge") {
    if (!data) return <div style={{ color: "#ccc", fontSize: 13 }}>Loading...</div>;
    if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{data.error}</div>;
    const value = data.value ?? 0;
    const min = config?.min ?? 0;
    const max = config?.max ?? 100;
    const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const thresholds = config?.thresholds || [];
    // Determine color based on thresholds (sorted ascending)
    let color = "#10b981"; // green by default
    const sorted = [...thresholds].sort((a, b) => a.value - b.value);
    for (const t of sorted) { if (value >= t.value) color = t.color; }
    // SVG arc gauge (semicircle)
    const cx = 100, cy = 90, r = 70;
    const startAngle = Math.PI;
    const endAngle = startAngle + pct * Math.PI;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    return (
      <div style={{ textAlign: "center" }}>
        <svg viewBox="0 0 200 110" style={{ width: "100%", maxWidth: 220 }}>
          {/* Background arc */}
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="round" />
          {/* Value arc */}
          {pct > 0.005 && <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />}
          {/* Threshold markers */}
          {sorted.map((t, i) => {
            const tp = Math.max(0, Math.min(1, (t.value - min) / (max - min || 1)));
            const ta = Math.PI + tp * Math.PI;
            const tx = cx + (r + 12) * Math.cos(ta), ty = cy + (r + 12) * Math.sin(ta);
            return <circle key={i} cx={tx} cy={ty} r={2} fill={t.color} />;
          })}
          {/* Value text */}
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize="28" fontWeight="700" fill="#1e293b">{typeof value === "number" ? (value % 1 === 0 ? value : value.toFixed(1)) : value}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#94a3b8">{config?.unit || ""}</text>
        </svg>
        <div style={{ fontSize: 11, color: "#666", marginTop: -4, textTransform: "uppercase" }}>{config?.label || data.label || ""}</div>
      </div>
    );
  }

  // ─── Compute widget ───────────────────────────────────────────────────────
  if (type === "compute" && (config?.formula === "energy_monitor" || config?.formula === "energy_compare")) {
    return <EnergyIntelligenceWidget config={config} />;
  }
  if (type === "compute") return <ComputeWidget config={config} controlState={controlState} />;

  // ─── Live widget ─────────────────────────────────────────────────────────
  if (type === "live") return <LiveWidget config={config} />;

  // ─── Data widgets ────────────────────────────────────────────────────────
  if (!data) return <div style={{ color: "#ccc", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{data.error}</div>;
  if (data.message) return <div style={{ color: "#94a3b8", fontSize: 12 }}>{data.message}</div>;
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
  // Chart types — rendered by Chart.js
  if (type === "chart" || ["line", "bar", "pie", "doughnut", "area", "scatter"].includes(type)) {
    const chartConfig = { ...config };
    if (type !== "chart" && !chartConfig.chart_type) chartConfig.chart_type = type;
    return <ChartWidget config={chartConfig} data={data} />;
  }
  return null;
}

// ─── Compute widget (formula engine — reads controls, computes, persists) ─────
function ComputeWidget({ config, controlState }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const prevInputsRef = useRef("");

  // Training wizard state
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState(null);
  const [models, setModels] = useState([]);
  const [showWizard, setShowWizard] = useState(false);
  const [availTables, setAvailTables] = useState([]);
  const [availColumns, setAvailColumns] = useState([]);
  const [trainConfig, setTrainConfig] = useState({
    source_table: config?.source_table || "",
    target_column: "",
    feature_columns: [],
    model_types: ["linear_regression", "random_forest", "xgboost", "ensemble"],
    training_interval: "hourly",
  });

  // Load available tables for data source selection
  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setAvailTables(d.tables || [])).catch(() => {});
  }, []);

  // Load columns when source table changes
  useEffect(() => {
    const tbl = trainConfig.source_table;
    if (!tbl) { setAvailColumns([]); return; }
    const t = availTables.find((t) => t.name === tbl);
    if (t) {
      const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
      setAvailColumns(cols.map((c) => c.name));
    }
  }, [trainConfig.source_table, availTables]);

  // Load trained models on mount
  useEffect(() => {
    fetch("/api/dashboards/train").then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [trainResult]);

  const runTraining = async () => {
    setTraining(true); setTrainResult(null);
    try {
      const res = await fetch("/api/dashboards/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_table: trainConfig.source_table || config.source_table || "power_consumption",
          target_column: trainConfig.target_column || "power_w",
          feature_columns: trainConfig.feature_columns.length > 0 ? trainConfig.feature_columns : ["hour", "dow", "temp_ext", "temp_int"],
          model_types: trainConfig.model_types,
          training_interval: trainConfig.training_interval,
        }),
      });
      const d = await res.json();
      setTrainResult(d.data || d);
      if (d.error) setError(d.error);
    } catch (e) { setError(e.message); }
    setTraining(false);
  };

  const inputs = {};
  const inputMap = config?.input_map || {};
  for (const [formulaKey, varName] of Object.entries(inputMap)) {
    if (controlState?.[varName] !== undefined) inputs[formulaKey] = controlState[varName];
  }

  useEffect(() => {
    const key = JSON.stringify(inputs) + config?.formula;
    if (key === prevInputsRef.current) return;
    prevInputsRef.current = key;
    if (!config?.model_config || Object.keys(config.model_config).length === 0) return;

    setLoading(true);
    fetch("/api/dashboards/compute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formula: config.formula || "energy_all",
        model_config: config.model_config,
        inputs,
        output_table: config.output_table || undefined,
        source_table: config.source_table || undefined,
      }),
    })
      .then((r) => r.json())
      .then((d) => { setResult(d.data); setError(d.error || null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(inputs), config?.formula]);

  if (!config?.model_config || Object.keys(config.model_config).length === 0) {
    return <div style={{ color: "#94a3b8", fontSize: 12, padding: 8 }}>Configure model parameters in edit mode</div>;
  }
  if (loading && !result) return <div style={{ color: "#94a3b8", fontSize: 12 }}>Computing...</div>;
  if (error) return <div style={{ color: "#e53e3e", fontSize: 12 }}>{error}</div>;
  if (!result) return <div style={{ color: "#ccc", fontSize: 12 }}>No result yet</div>;

  const cs = { background: "#f8fafc", borderRadius: 8, padding: "10px 14px", textAlign: "center" };
  const ls = { fontSize: 10, color: "#64748b", textTransform: "uppercase", marginBottom: 2 };
  const vs = { fontSize: 22, fontWeight: 700, color: "#1e293b" };
  const us = { fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 2 };
  const rs = { fontSize: 10, color: "#94a3b8", marginTop: 2 };

  // ─── energy_compare display: actual vs predicted + bins + savings ───────
  if ((config?.formula === "energy_compare" || config?.formula === "energy_monitor") && result.summary) {
    const s = result.summary;
    const statusColor = s.overall_status === "UNDER BUDGET" ? "#15803d" : "#dc2626";
    const bins = result.power_bins || [];
    const daily = result.daily_stats || [];
    const gam = result.gamification || {};
    const alerts = result.alerts || [];
    const tBins = result.time_bins || {};
    const demand = result.demand || {};

    // Active model from ei_models
    const activeModel = models.find((m) => m.is_active === true || m.is_active === "true");
    const MODEL_TYPES = ["linear_regression", "random_forest", "xgboost", "ensemble"];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <div style={{ fontSize: 10, color: "#3b82f6", textAlign: "right" }}>Updating...</div>}

        {/* Model bar — active model info + train/retrain button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 12 }}>
            {activeModel ? (
              <span>
                <span style={{ fontWeight: 600 }}>{activeModel.name}</span>
                {activeModel.accuracy && (() => { try { const a = typeof activeModel.accuracy === "string" ? JSON.parse(activeModel.accuracy) : activeModel.accuracy; return <span style={{ color: "#64748b", marginLeft: 8 }}>R²={a.r2} · MAE={a.mae}</span>; } catch { return null; } })()}
                <span style={{ color: "#94a3b8", marginLeft: 8, fontSize: 10 }}>{models.length} models trained</span>
              </span>
            ) : (
              <span style={{ color: "#94a3b8" }}>No model trained yet — click Train to start</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setShowWizard(!showWizard)} disabled={training}
              style={{ padding: "4px 12px", fontSize: 11, background: showWizard ? "#dbeafe" : "#3b82f6", color: showWizard ? "#1e40af" : "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
              {training ? "Training..." : showWizard ? "Close" : activeModel ? "Retrain" : "Train Model"}
            </button>
          </div>
        </div>

        {/* Training wizard */}
        {showWizard && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Training Wizard</div>

            {/* Step 1: Data Source */}
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: "#555", marginBottom: 4 }}>1. Data Source</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <select value={trainConfig.source_table} onChange={(e) => setTrainConfig({ ...trainConfig, source_table: e.target.value, target_column: "", feature_columns: [] })}
                  style={{ flex: 2, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}>
                  <option value="">Select table...</option>
                  {availTables.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.row_count || 0} rows)</option>)}
                </select>
                <select value={trainConfig.training_interval} onChange={(e) => setTrainConfig({ ...trainConfig, training_interval: e.target.value })}
                  style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}>
                  <option value="15min">15-min</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
              {/* Target column */}
              {availColumns.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>Target (what to predict):</div>
                  <select value={trainConfig.target_column} onChange={(e) => setTrainConfig({ ...trainConfig, target_column: e.target.value })}
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}>
                    <option value="">Select column...</option>
                    {availColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {/* Feature columns */}
              {availColumns.length > 0 && trainConfig.target_column && (
                <div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>Features (inputs to model):</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {availColumns.filter((c) => c !== trainConfig.target_column).map((c) => (
                      <label key={c} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, cursor: "pointer", padding: "2px 6px", background: trainConfig.feature_columns.includes(c) ? "#dbeafe" : "#f8fafc", borderRadius: 4, border: "1px solid #e2e8f0" }}>
                        <input type="checkbox" checked={trainConfig.feature_columns.includes(c)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...trainConfig.feature_columns, c] : trainConfig.feature_columns.filter((x) => x !== c);
                            setTrainConfig({ ...trainConfig, feature_columns: next });
                          }}
                          style={{ width: 12, height: 12 }} />
                        {c}
                      </label>
                    ))}
                    {/* Auto-generated time features */}
                    {["hour", "dow", "is_weekend", "delta_t"].map((c) => (
                      <label key={c} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, cursor: "pointer", padding: "2px 6px", background: trainConfig.feature_columns.includes(c) ? "#dbeafe" : "#f0fdf4", borderRadius: 4, border: "1px solid #bbf7d0" }}>
                        <input type="checkbox" checked={trainConfig.feature_columns.includes(c)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...trainConfig.feature_columns, c] : trainConfig.feature_columns.filter((x) => x !== c);
                            setTrainConfig({ ...trainConfig, feature_columns: next });
                          }}
                          style={{ width: 12, height: 12 }} />
                        {c} <span style={{ fontSize: 9, color: "#16a34a" }}>auto</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Model types */}
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: "#555", marginBottom: 4 }}>2. Select Models</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {MODEL_TYPES.map((t) => (
                  <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                    <input type="checkbox" checked={trainConfig.model_types.includes(t)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...trainConfig.model_types, t] : trainConfig.model_types.filter((x) => x !== t);
                        setTrainConfig({ ...trainConfig, model_types: next });
                      }} />
                    {{ linear_regression: "Linear Regression", random_forest: "Random Forest", xgboost: "XGBoost", ensemble: "Ensemble (Voting)" }[t]}
                  </label>
                ))}
              </div>
            </div>

            {/* Step 3: Train button */}
            <button onClick={runTraining}
              disabled={training || trainConfig.model_types.length === 0 || !trainConfig.source_table || !trainConfig.target_column}
              style={{ padding: "8px 20px", background: (!trainConfig.source_table || !trainConfig.target_column) ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%" }}>
              {training ? "Training in progress..." : !trainConfig.source_table ? "Select a table first" : !trainConfig.target_column ? "Select target column" : `Train ${trainConfig.model_types.length} Model${trainConfig.model_types.length > 1 ? "s" : ""}`}
            </button>

            {/* Step 4: Results */}
            {trainResult?.models && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, color: "#555", marginBottom: 4, fontSize: 12 }}>Results</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={{ padding: 4, border: "1px solid #eee", textAlign: "left" }}>Model</th>
                      <th style={{ padding: 4, border: "1px solid #eee" }}>MAE</th>
                      <th style={{ padding: 4, border: "1px solid #eee" }}>RMSE</th>
                      <th style={{ padding: 4, border: "1px solid #eee" }}>R²</th>
                      <th style={{ padding: 4, border: "1px solid #eee" }}>Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainResult.models.map((m) => (
                      <tr key={m.model_type} style={{ background: m.model_type === trainResult.best?.model_type ? "#f0fde8" : "transparent" }}>
                        <td style={{ padding: 4, border: "1px solid #eee" }}>{m.name}</td>
                        <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{m.mae}</td>
                        <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{m.rmse}</td>
                        <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right", fontWeight: 600 }}>{m.r2}</td>
                        <td style={{ padding: 4, border: "1px solid #eee", textAlign: "center" }}>
                          {m.model_type === trainResult.best?.model_type ? "\u2B50" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  Trained on {trainResult.training_rows} rows, tested on {trainResult.test_rows} rows.
                  Best model activated automatically.
                </div>
              </div>
            )}

            {/* Trained models list */}
            {models.length > 0 && !trainResult && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, color: "#555", marginBottom: 4, fontSize: 12 }}>Trained Models ({models.length})</div>
                <div style={{ maxHeight: 120, overflow: "auto" }}>
                  {models.map((m, i) => {
                    let acc = {};
                    try { acc = typeof m.accuracy === "string" ? JSON.parse(m.accuracy) : (m.accuracy || {}); } catch {}
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: "1px solid #f0f0f0", fontSize: 11 }}>
                        <span>
                          {(m.is_active === true || m.is_active === "true") && "\u2B50 "}
                          {m.name}
                        </span>
                        <span style={{ color: "#64748b" }}>R²={acc.r2 || "?"} MAE={acc.mae || "?"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <div style={{ ...cs, borderLeft: `4px solid ${statusColor}` }}>
            <div style={ls}>Status</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{s.overall_status}</div>
            <div style={rs}>{s.total_days} days tracked</div>
          </div>
          <div style={cs}>
            <div style={ls}>Savings</div>
            <div style={{ ...vs, color: s.savings_total_kWh >= 0 ? "#15803d" : "#dc2626" }}>{s.savings_total_kWh}<span style={us}>kWh</span></div>
            <div style={rs}>{s.savings_cost_thb} THB</div>
          </div>
          <div style={cs}>
            <div style={ls}>Success Rate</div>
            <div style={vs}>{s.success_rate}<span style={us}>%</span></div>
            <div style={rs}>{s.days_under} under / {s.days_over} over</div>
          </div>
          <div style={cs}>
            <div style={ls}>Total Cost</div>
            <div style={vs}>{s.actual_cost_thb}<span style={us}>THB</span></div>
            <div style={rs}>predicted: {s.predicted_cost_thb} THB</div>
          </div>
        </div>

        {/* Actual vs Predicted chart */}
        {result.chart && (
          <div style={{ background: "#fff", borderRadius: 8, padding: 12, border: "1px solid #e5e7eb" }}>
            <ChartWidget config={{ chart_type: "bar", title: "Daily: Actual vs Predicted", show_legend: true, y_label: "kWh" }} data={result.chart} />
          </div>
        )}

        {/* Power bins */}
        {bins.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${bins.length}, 1fr)`, gap: 8 }}>
            {bins.map((b, i) => (
              <div key={i} style={{ ...cs, padding: "8px 10px" }}>
                <div style={{ ...ls, fontSize: 9 }}>{b.label} ({b.range})</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{b.total_kwh}<span style={{ ...us, fontSize: 10 }}>kWh</span></div>
                <div style={rs}>{b.readings} readings · avg {b.avg_power}W</div>
              </div>
            ))}
          </div>
        )}

        {/* Daily stats table */}
        {daily.length > 0 && (
          <div style={{ overflow: "auto", maxHeight: 200 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: 4, border: "1px solid #eee", textAlign: "left" }}>Date</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Actual</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Predicted</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Savings</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Te</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Hours</th>
                  <th style={{ padding: 4, border: "1px solid #eee" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.date}>
                    <td style={{ padding: 4, border: "1px solid #eee" }}>{d.date}</td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{d.actual_kwh}</td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{d.predicted_kwh}</td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right", color: d.savings_kwh >= 0 ? "#15803d" : "#dc2626" }}>
                      {d.savings_kwh > 0 ? "+" : ""}{d.savings_kwh} ({d.savings_pct}%)
                    </td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{d.avg_Te}°C</td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "right" }}>{d.operating_hours}h</td>
                    <td style={{ padding: 4, border: "1px solid #eee", textAlign: "center" }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: d.status === "under" ? "#f0fde8" : "#fef2f2", color: d.status === "under" ? "#15803d" : "#dc2626" }}>
                        {d.status === "under" ? "UNDER" : "OVER"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Gamification panel */}
        {gam.total_badges > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ ...cs, textAlign: "left" }}>
              <div style={{ ...ls, marginBottom: 6 }}>Badges Earned</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(gam.badge_counts || {}).map(([badge, count]) => {
                  const icons = { perfectDay: "\u2B50", streak3: "\uD83D\uDD25", streak7: "\uD83C\uDF1F", morningWinner: "\u2600\uFE0F", afternoonWinner: "\uD83C\uDF24\uFE0F", eveningWinner: "\uD83C\uDF19", demandDefender: "\uD83D\uDEE1\uFE0F" };
                  return (
                    <span key={badge} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
                      {icons[badge] || "\uD83C\uDFC5"} {badge} x{count}
                    </span>
                  );
                })}
              </div>
              <div style={{ ...rs, marginTop: 6 }}>
                Streak: {gam.current_streak} days (best: {gam.max_streak})
              </div>
            </div>
            <div style={{ ...cs, textAlign: "left" }}>
              <div style={{ ...ls, marginBottom: 6 }}>Leaderboard (Top Days)</div>
              {(gam.leaderboard || []).map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span>{i + 1}. {d.date}</span>
                  <span style={{ color: "#15803d", fontWeight: 600 }}>+{d.savings_pct}% ({d.savings_kwh} kWh)</span>
                </div>
              ))}
              {(gam.leaderboard || []).length === 0 && <div style={{ color: "#ccc", fontSize: 11 }}>No days under target yet</div>}
            </div>
          </div>
        )}

        {/* Calendar heatmap */}
        {(gam.calendar || []).length > 0 && (
          <div style={cs}>
            <div style={{ ...ls, marginBottom: 6, textAlign: "left" }}>Daily Performance</div>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {(gam.calendar || []).map((d) => (
                <div key={d.date} title={`${d.date}: ${d.value > 0 ? "+" : ""}${d.value}% ${d.badges > 0 ? `(${d.badges} badges)` : ""}`}
                  style={{
                    width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, fontWeight: 600, cursor: "default",
                    background: d.status === "under" ? (d.value > 10 ? "#bbf7d0" : "#dcfce7") : (d.value < -10 ? "#fecaca" : "#fef2f2"),
                    color: d.status === "under" ? "#15803d" : "#dc2626",
                  }}>
                  {d.date.slice(8)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time bins + Demand */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {Object.values(tBins).map((b) => (
            <div key={b.label} style={{ ...cs, padding: "8px 10px" }}>
              <div style={{ ...ls, fontSize: 9 }}>{b.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{b.kwh}<span style={{ ...us, fontSize: 10 }}>kWh</span></div>
              <div style={rs}>{b.count} readings, avg {b.avg_w}W</div>
            </div>
          ))}
          <div style={{ ...cs, padding: "8px 10px", borderLeft: `3px solid ${demand.status === "OK" ? "#10b981" : "#ef4444"}` }}>
            <div style={{ ...ls, fontSize: 9 }}>Demand Peak</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{demand.peak_kw}<span style={{ ...us, fontSize: 10 }}>kW</span></div>
            <div style={rs}>Budget: {demand.budget_kw} kW ({demand.usage_pct}%)</div>
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ ...cs, textAlign: "left", padding: "8px 12px" }}>
            <div style={{ ...ls, marginBottom: 4 }}>Alerts</div>
            {alerts.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                borderBottom: i < alerts.length - 1 ? "1px solid #f0f0f0" : "none",
              }}>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                  background: a.severity === "critical" ? "#fef2f2" : "#fffbeb",
                  color: a.severity === "critical" ? "#dc2626" : "#d97706",
                }}>{a.severity.toUpperCase()}</span>
                <span style={{ fontSize: 11, color: "#334155" }}>{a.message}</span>
              </div>
            ))}
          </div>
        )}

        {result._persisted && <div style={{ fontSize: 9, color: "#10b981", textAlign: "right" }}>Saved to {config.output_table}</div>}
      </div>
    );
  }

  // ─── energy_all display: what-if prediction cards ──────────────────────
  const rec = result.recommendation;
  const recColor = rec?.recommendation === "KEEP ON" ? "#15803d" : "#dc2626";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {loading && <div style={{ fontSize: 10, color: "#3b82f6", textAlign: "right" }}>Updating...</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <div style={cs}><div style={ls}>Energy</div><div style={vs}>{result.energy?.total_kWh}<span style={us}>kWh</span></div><div style={rs}>{result.energy?.total_lower_kWh} — {result.energy?.total_upper_kWh}</div></div>
        <div style={cs}><div style={ls}>Cost</div><div style={vs}>{result.cost?.total_thb}<span style={us}>THB</span></div><div style={rs}>{result.cost?.lower_thb} — {result.cost?.upper_thb}</div></div>
        <div style={cs}><div style={ls}>Cooldown</div><div style={vs}>{result.time?.pulldown_min}<span style={us}>min</span></div><div style={rs}>{result.time?.pulldown_lower_min} — {result.time?.pulldown_upper_min}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        <div style={{ ...cs, padding: "6px 8px" }}><div style={{ ...ls, fontSize: 9 }}>Z1 Pulldown</div><div style={{ fontSize: 14, fontWeight: 600 }}>{result.energy?.zone1_Wh}<span style={{ ...us, fontSize: 10 }}>Wh</span></div></div>
        <div style={{ ...cs, padding: "6px 8px" }}><div style={{ ...ls, fontSize: 9 }}>Z2 Transition</div><div style={{ fontSize: 14, fontWeight: 600 }}>{result.energy?.zone2_Wh}<span style={{ ...us, fontSize: 10 }}>Wh</span></div></div>
        <div style={{ ...cs, padding: "6px 8px" }}><div style={{ ...ls, fontSize: 9 }}>Z3 Settling</div><div style={{ fontSize: 14, fontWeight: 600 }}>{result.energy?.zone3_Wh}<span style={{ ...us, fontSize: 10 }}>Wh</span></div></div>
        <div style={{ ...cs, padding: "6px 8px" }}><div style={{ ...ls, fontSize: 9 }}>Cycling</div><div style={{ fontSize: 14, fontWeight: 600 }}>{result.energy?.cycling_power_W}<span style={{ ...us, fontSize: 10 }}>W</span></div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ ...cs, borderLeft: `4px solid ${recColor}` }}><div style={ls}>{result.inputs?.hours_away || 3}h away?</div><div style={{ fontSize: 16, fontWeight: 700, color: recColor }}>{rec?.recommendation}</div><div style={rs}>Keep: {Math.round(rec?.keep_on_Wh)}Wh vs Restart: {Math.round(rec?.restart_Wh)}Wh</div></div>
        <div style={cs}><div style={ls}>Warmup if off</div><div style={{ fontSize: 13 }}><b>2h:</b> {result.warmup?.temp_after_2h}°C <b>4h:</b> {result.warmup?.temp_after_4h}°C</div></div>
      </div>
      {result._persisted && <div style={{ fontSize: 9, color: "#10b981", textAlign: "right" }}>Saved to {config.output_table}</div>}
    </div>
  );
}

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
      const res = await fetch(`/api/pages/${page.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
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
const menuItem = { display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, color: "#333" };
const miniBtn = { padding: "1px 5px", background: "none", border: "1px solid #ddd", borderRadius: 2, cursor: "pointer", fontSize: 10, color: "#666" };
const sizeBtn = { padding: "1px 5px", border: "none", borderRadius: 2, cursor: "pointer", fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: "center" };
const cfgInput = { display: "block", width: "100%", padding: 4, border: "1px solid #ddd", borderRadius: 3, fontSize: 12, marginBottom: 4, boxSizing: "border-box" };
const toolbarBtn = { padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 };
