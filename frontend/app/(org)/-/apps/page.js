"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";

const APP_TYPES = [
  { id: "html", label: "HTML / JS", icon: "\u{1F310}", desc: "Static web app (HTML, CSS, JavaScript)" },
  { id: "dash", label: "Dash (Python)", icon: "\u{1F4CA}", desc: "Python Dash dashboard app" },
  { id: "visual", label: "Visual Flow", icon: "\u{1F9E9}", desc: "Block-based visual programming" },
];

export default function AppsPage() {
  const { user, hasFeature, refresh } = useUser();
  const [apps, setApps] = useState([]);
  const [navGroups, setNavGroups] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "", app_type: "html", icon: "\u{1F4F1}" });
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadApps(); loadGroups(); }, []);

  const loadApps = () => {
    fetch("/api/apps").then((r) => r.ok ? r.json() : { apps: [] }).then((d) => setApps(d.apps || []));
  };
  const loadGroups = () => {
    fetch("/api/nav-groups").then((r) => r.ok ? r.json() : { groups: [] }).then((d) => setNavGroups(d.groups || []));
  };

  if (!user) return null;

  if (!hasFeature("app_builder")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Apps</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          App Builder feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  const createApp = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", slug: "", description: "", app_type: "html", icon: "\u{1F4F1}" });
    setShowCreate(false);
    loadApps();
  };

  const publishApp = async (id) => {
    await fetch(`/api/apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    loadApps();
    refresh(); // Refresh nav to show new app
  };

  const unpublishApp = async (id) => {
    await fetch(`/api/apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });
    loadApps();
    refresh();
  };

  const deleteApp = async (id, name) => {
    if (!confirm(`Delete app "${name}"? This removes the app and its permission.`)) return;
    await fetch(`/api/apps/${id}`, { method: "DELETE" });
    loadApps();
    refresh();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Apps</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            Build and deploy apps. Published apps appear in the navigation for permitted users.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={btnBlue}>
          {showCreate ? "Cancel" : "New App"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createApp} style={{ padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Create App</h3>

          {/* App type selection */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {APP_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setForm({ ...form, app_type: t.id })}
                style={{
                  flex: 1, padding: 12, borderRadius: 8, cursor: "pointer", textAlign: "center",
                  border: form.app_type === t.id ? "2px solid #0070f3" : "1px solid #ddd",
                  background: form.app_type === t.id ? "#e8f4ff" : "#fff",
                }}>
                <div style={{ fontSize: 24 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{t.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder="App Name" value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-/, "");
                setForm({ ...form, name, slug });
              }} style={inputStyle} />
            <input placeholder="slug" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              style={{ ...inputStyle, flex: "none", width: 160 }} />
            <input placeholder="Icon (emoji)" value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              style={{ ...inputStyle, flex: "none", width: 60, textAlign: "center" }} />
          </div>
          <input placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />
          <button type="submit" style={btnBlue}>Create App</button>
          {error && <p style={{ color: "#e53e3e", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}
        </form>
      )}

      {/* Nav Groups */}
      <div style={{ marginBottom: 16, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Navigation Groups</strong>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {navGroups.map((g) => (
            <span key={g.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "#f7f7f7", borderRadius: 4, fontSize: 12 }}>
              {g.icon} {g.name}
              <button onClick={async () => {
                await fetch("/api/nav-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_group", name: g.name }) });
                loadGroups(); refresh();
              }} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 11, padding: 0 }}>x</button>
            </span>
          ))}
          {navGroups.length === 0 && <span style={{ fontSize: 12, color: "#999" }}>No groups yet</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <input placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={async (e) => { if (e.key === "Enter" && newGroupName.trim()) {
              await fetch("/api/nav-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_group", name: newGroupName }) });
              setNewGroupName(""); loadGroups(); refresh();
            }}}
            style={{ padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, width: 150 }} />
          <button onClick={async () => { if (!newGroupName.trim()) return;
            await fetch("/api/nav-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_group", name: newGroupName }) });
            setNewGroupName(""); loadGroups(); refresh();
          }} style={{ padding: "6px 12px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Add Group</button>
        </div>
        <p style={{ fontSize: 11, color: "#999", margin: "8px 0 0" }}>Groups organize published apps and dashboards into sections in the left navigation.</p>
      </div>

      {/* App list */}
      {apps.length > 0 ? (
        <div>
          {apps.map((app) => (
            <div key={app.id} style={{
              padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{app.icon}</span>
                  <strong>{app.name}</strong>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                    background: app.status === "published" ? "#f0fde8" : "#f7f7f7",
                    color: app.status === "published" ? "#38a169" : "#999",
                  }}>
                    {app.status}
                  </span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#e8f4ff", color: "#0070f3" }}>
                    {APP_TYPES.find((t) => t.id === app.app_type)?.label || app.app_type}
                  </span>
                </div>
                {app.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>{app.description}</p>}
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  <code>/apps/{app.slug}</code>
                  {app.permission_id && <span> &middot; <code>{app.permission_id}</code></span>}
                  {app.status === "published" && (
                    <span> &middot; group: <select value={app.nav_group || ""} onChange={async (e) => {
                      await fetch("/api/nav-groups", { method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "assign", item_type: "app", item_id: app.id, group: e.target.value }) });
                      loadApps(); refresh();
                    }} style={{ padding: 2, fontSize: 11, border: "1px solid #ddd", borderRadius: 3 }}>
                      <option value="">(none)</option>
                      {navGroups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select></span>
                  )}
                  {app.created_by_name && <span> &middot; by {app.created_by_name}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {app.status === "published" ? (
                  <>
                    <Link href={`/apps/${app.slug}`} style={{ ...btnSmall, color: "#0070f3", textDecoration: "none" }}>Open</Link>
                    <button onClick={() => unpublishApp(app.id)} style={{ ...btnSmall, color: "#f59e0b" }}>Unpublish</button>
                  </>
                ) : (
                  <button onClick={() => publishApp(app.id)} style={{ ...btnSmall, color: "#38a169", borderColor: "#38a169" }}>Publish</button>
                )}
                <button onClick={() => deleteApp(app.id, app.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u{1F4F1}"}</div>
          <h2 style={{ margin: "0 0 8px" }}>No Apps Yet</h2>
          <p style={{ color: "#666", fontSize: 14 }}>
            Create your first app. Three modes available:
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
            {APP_TYPES.map((t) => (
              <div key={t.id} style={{ textAlign: "center", fontSize: 13 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <strong>{t.label}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
