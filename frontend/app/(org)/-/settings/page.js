"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

export default function SettingsPage() {
  const { user, org, hasPermission, refresh } = useUser();
  const [tab, setTab] = useState("nav");
  const [navGroups, setNavGroups] = useState([]);
  const [navApps, setNavApps] = useState([]);
  const [navDashboards, setNavDashboards] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");

  useEffect(() => { loadNavData(); }, []);

  const loadNavData = async () => {
    const res = await fetch("/api/nav-groups");
    if (res.ok) {
      const d = await res.json();
      setNavGroups(d.groups || []);
      setNavApps(d.apps || []);
      setNavDashboards(d.dashboards || []);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await fetch("/api/nav-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_group", name: newGroupName, icon: newGroupIcon || "", sort_order: navGroups.length }),
    });
    setNewGroupName(""); setNewGroupIcon("");
    loadNavData(); refresh();
  };

  const deleteGroup = async (name) => {
    if (!confirm(`Delete group "${name}"? Items will be ungrouped.`)) return;
    await fetch("/api/nav-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_group", name }),
    });
    loadNavData(); refresh();
  };

  const assignItem = async (itemType, itemId, group) => {
    await fetch("/api/nav-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", item_type: itemType, item_id: itemId, group }),
    });
    loadNavData(); refresh();
  };

  if (!user) return null;

  const TABS = [
    { id: "nav", label: "Navigation", icon: "\u{1F4CB}" },
    { id: "org", label: "Organization", icon: "\u{1F3E2}" },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 16px" }}>Settings</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === t.id ? "#0070f3" : "transparent", color: tab === t.id ? "#fff" : "#666",
            borderRadius: "6px 6px 0 0",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Navigation Settings */}
      {tab === "nav" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Navigation Groups</h2>
          <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px" }}>
            Organize published apps and dashboards into groups in the left sidebar.
          </p>

          {/* Create group */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()} style={inputStyle} />
            <input placeholder="Icon (emoji)" value={newGroupIcon} onChange={(e) => setNewGroupIcon(e.target.value)}
              style={{ ...inputStyle, width: 80, flex: "none", textAlign: "center" }} />
            <button onClick={createGroup} style={btnBlue}>Add Group</button>
          </div>

          {/* Groups with assigned items */}
          {navGroups.map((g) => {
            const items = [
              ...navDashboards.filter((d) => d.nav_group === g.name).map((d) => ({ ...d, _type: "dashboard", _icon: "\u{1F4CA}" })),
              ...navApps.filter((a) => a.nav_group === g.name).map((a) => ({ ...a, _type: "app", _icon: a.icon || "\u{1F4F1}" })),
            ];
            return (
              <div key={g.name} style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 14 }}>{g.icon} {g.name}</strong>
                  <button onClick={() => deleteGroup(g.name)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 }}>Delete group</button>
                </div>
                {items.length > 0 ? items.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 13 }}>{item._icon} {item.name} <span style={{ color: "#999", fontSize: 11 }}>({item._type})</span></span>
                    <button onClick={() => assignItem(item._type, item.id, "")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11 }}>Remove</button>
                  </div>
                )) : <p style={{ color: "#999", fontSize: 12, margin: 0 }}>No items in this group</p>}
              </div>
            );
          })}

          {/* Ungrouped published items */}
          {(() => {
            const ungrouped = [
              ...navDashboards.filter((d) => !d.nav_group).map((d) => ({ ...d, _type: "dashboard", _icon: "\u{1F4CA}" })),
              ...navApps.filter((a) => !a.nav_group).map((a) => ({ ...a, _type: "app", _icon: a.icon || "\u{1F4F1}" })),
            ];
            if (ungrouped.length === 0) return null;
            return (
              <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <strong style={{ fontSize: 14 }}>Ungrouped</strong>
                {ungrouped.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 13 }}>{item._icon} {item.name}</span>
                    <select onChange={(e) => e.target.value && assignItem(item._type, item.id, e.target.value)} style={{ padding: 4, fontSize: 12, border: "1px solid #ddd", borderRadius: 4 }}>
                      <option value="">Move to group...</option>
                      {navGroups.map((g) => <option key={g.name} value={g.name}>{g.icon} {g.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Org Settings */}
      {tab === "org" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Organization</h2>
          {org && (
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#666" }}>Name:</span><strong>{org.name}</strong>
                <span style={{ color: "#666" }}>Slug:</span><code>{org.slug}</code>
                <span style={{ color: "#666" }}>Plan:</span><span>{org.plan}</span>
              </div>
            </div>
          )}

          <h3 style={{ margin: "24px 0 8px", fontSize: 15 }}>Access Control Summary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <a href="/-/users" style={cardLink}>
              <div style={{ fontSize: 24 }}>{"\u{1F465}"}</div>
              <strong>Users</strong>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Manage users, profiles, multi-role assignment</p>
            </a>
            <a href="/-/roles" style={cardLink}>
              <div style={{ fontSize: 24 }}>{"\u{1F6E1}"}</div>
              <strong>Roles</strong>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Define roles and assign permissions</p>
            </a>
            <a href="/-/permissions" style={cardLink}>
              <div style={{ fontSize: 24 }}>{"\u{1F511}"}</div>
              <strong>Permissions</strong>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>System + custom app permissions</p>
            </a>
          </div>

          <h3 style={{ margin: "24px 0 8px", fontSize: 15 }}>How Permissions Work</h3>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, fontSize: 13, lineHeight: 1.8 }}>
            <strong>Access to an app/dashboard:</strong> <code>app.{"{slug}"}</code> — auto-created when published, assign to roles<br />
            <strong>What users can DO inside:</strong> their role's system permissions (<code>db.view</code>, <code>db.create</code>, etc.)<br />
            <strong>Custom app logic:</strong> create app permissions in Permissions page, check with <code>sdk.can("app.myapp.approve")</code><br />
            <strong>Multi-role:</strong> user with multiple roles gets the union of all permissions<br />
            <br />
            <strong>JS apps:</strong> <code>&lt;script src="/sdk.js"&gt;&lt;/script&gt;</code> then <code>IoTStack.can("db.create")</code><br />
            <strong>Python:</strong> <code>client.me()["permissions"]</code> contains all permissions
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const cardLink = { display: "block", padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textDecoration: "none", color: "#333", textAlign: "center" };
