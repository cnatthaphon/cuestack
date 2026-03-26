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
  const [editingGroup, setEditingGroup] = useState(null);
  const [dragItem, setDragItem] = useState(null);

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

  const api = async (body) => {
    await fetch("/api/nav-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    loadNavData();
    refresh();
  };

  const createGroup = () => {
    if (!newGroupName.trim()) return;
    api({ action: "create_group", name: newGroupName, icon: newGroupIcon || "\u{1F4C1}", sort_order: navGroups.length });
    setNewGroupName(""); setNewGroupIcon("");
  };

  const deleteGroup = (name) => {
    if (!confirm(`Delete folder "${name}"? Apps will be ungrouped.`)) return;
    api({ action: "delete_group", name });
  };

  const renameGroup = (oldName, newName, icon) => {
    api({ action: "rename_group", old_name: oldName, new_name: newName, icon });
    setEditingGroup(null);
  };

  const moveGroupUp = (idx) => {
    if (idx === 0) return;
    const reordered = [...navGroups];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    api({ action: "reorder_groups", order: reordered.map((g, i) => ({ name: g.name, sort_order: i })) });
  };

  const moveGroupDown = (idx) => {
    if (idx >= navGroups.length - 1) return;
    const reordered = [...navGroups];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    api({ action: "reorder_groups", order: reordered.map((g, i) => ({ name: g.name, sort_order: i })) });
  };

  // Get all items in a group (or ungrouped if group="")
  const getGroupItems = (groupName) => {
    const items = [
      ...navApps.filter((a) => (a.nav_group || "") === groupName).map((a) => ({ ...a, _type: "app", _icon: a.icon || "\u{1F4F1}" })),
      ...navDashboards.filter((d) => (d.nav_group || "") === groupName).map((d) => ({ ...d, _type: "dashboard", _icon: "\u{1F4CA}" })),
    ];
    return items.sort((a, b) => (a.nav_order || 0) - (b.nav_order || 0));
  };

  // Drag and drop items between groups
  const handleDragStart = (item) => setDragItem(item);
  const handleDropOnGroup = (targetGroup) => {
    if (!dragItem) return;
    api({ action: "assign", item_type: dragItem._type, item_id: dragItem.id, group: targetGroup, order: 0 });
    setDragItem(null);
  };

  const moveItemUp = (item, groupName) => {
    const items = getGroupItems(groupName);
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx <= 0) return;
    const reordered = items.map((it, i) => ({
      id: it.id, type: it._type,
      nav_group: groupName,
      nav_order: i === idx ? items[idx - 1].nav_order || idx - 1 : i === idx - 1 ? items[idx].nav_order || idx : it.nav_order || i,
    }));
    // Simpler: just swap orders
    const updates = items.map((it, i) => ({ id: it.id, type: it._type, nav_group: groupName, nav_order: i }));
    [updates[idx - 1], updates[idx]] = [updates[idx], updates[idx - 1]];
    updates.forEach((u, i) => u.nav_order = i);
    api({ action: "reorder_items", items: updates });
  };

  const moveItemDown = (item, groupName) => {
    const items = getGroupItems(groupName);
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= items.length - 1) return;
    const updates = items.map((it, i) => ({ id: it.id, type: it._type, nav_group: groupName, nav_order: i }));
    [updates[idx], updates[idx + 1]] = [updates[idx + 1], updates[idx]];
    updates.forEach((u, i) => u.nav_order = i);
    api({ action: "reorder_items", items: updates });
  };

  if (!user) return null;

  const ungrouped = getGroupItems("");

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

      {tab === "nav" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>App Navigation</h2>
              <p style={{ color: "#666", fontSize: 13, margin: "4px 0 0" }}>Organize published apps into folders. Drag items between folders. Reorder with arrows.</p>
            </div>
          </div>

          {/* Create folder */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <input placeholder="Folder name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()} style={inputStyle} />
            <input placeholder="Icon" value={newGroupIcon} onChange={(e) => setNewGroupIcon(e.target.value)}
              style={{ ...inputStyle, width: 60, flex: "none", textAlign: "center" }} />
            <button onClick={createGroup} style={btnBlue}>Add Folder</button>
          </div>

          {/* Folders with items */}
          {navGroups.map((group, gi) => {
            const items = getGroupItems(group.name);
            const isEditing = editingGroup === group.name;
            return (
              <div key={group.name}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOnGroup(group.name)}
                style={{
                  marginBottom: 12, background: "#fff", borderRadius: 8,
                  border: dragItem ? "2px dashed #0070f3" : "1px solid #e2e8f0",
                }}>
                {/* Folder header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: items.length ? "1px solid #f0f0f0" : "none" }}>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: 4, flex: 1 }}>
                      <input defaultValue={group.icon} id={`icon-${group.name}`} style={{ ...inputStyle, width: 40, flex: "none", textAlign: "center" }} />
                      <input defaultValue={group.name} id={`name-${group.name}`} style={{ ...inputStyle, flex: 1 }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameGroup(group.name, document.getElementById(`name-${group.name}`).value, document.getElementById(`icon-${group.name}`).value);
                        }} autoFocus />
                      <button onClick={() => renameGroup(group.name, document.getElementById(`name-${group.name}`).value, document.getElementById(`icon-${group.name}`).value)} style={btnSmall}>Save</button>
                      <button onClick={() => setEditingGroup(null)} style={btnSmall}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{group.icon || "\u{1F4C1}"}</span>
                        <strong style={{ fontSize: 14 }}>{group.name}</strong>
                        <span style={{ fontSize: 12, color: "#999" }}>({items.length})</span>
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button onClick={() => moveGroupUp(gi)} disabled={gi === 0} style={arrowBtn}>&uarr;</button>
                        <button onClick={() => moveGroupDown(gi)} disabled={gi >= navGroups.length - 1} style={arrowBtn}>&darr;</button>
                        <button onClick={() => setEditingGroup(group.name)} style={btnSmall}>Rename</button>
                        <button onClick={() => deleteGroup(group.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
                {/* Items */}
                {items.map((item, ii) => (
                  <div key={item.id} draggable
                    onDragStart={() => handleDragStart(item)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px 8px 32px", borderBottom: "1px solid #f5f5f5", cursor: "grab" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#ccc", cursor: "grab" }}>{"\u2630"}</span>
                      <span>{item._icon}</span>
                      <span style={{ fontSize: 13 }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: "#999" }}>({item._type})</span>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={() => moveItemUp(item, group.name)} disabled={ii === 0} style={arrowBtn}>&uarr;</button>
                      <button onClick={() => moveItemDown(item, group.name)} disabled={ii >= items.length - 1} style={arrowBtn}>&darr;</button>
                      <button onClick={() => api({ action: "assign", item_type: item._type, item_id: item.id, group: "", order: 0 })} style={{ ...btnSmall, color: "#999" }}>Remove</button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ padding: "12px 32px", color: "#ccc", fontSize: 13 }}>Drop apps here</div>
                )}
              </div>
            );
          })}

          {/* Ungrouped items */}
          {ungrouped.length > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}
              onDragOver={(e) => e.preventDefault()} onDrop={() => handleDropOnGroup("")}>
              <strong style={{ fontSize: 14, color: "#666" }}>Ungrouped</strong>
              {ungrouped.map((item) => (
                <div key={item.id} draggable onDragStart={() => handleDragStart(item)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5f5f5", cursor: "grab" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#ccc" }}>{"\u2630"}</span>
                    <span>{item._icon}</span>
                    <span style={{ fontSize: 13 }}>{item.name}</span>
                  </div>
                  <select onChange={(e) => { if (e.target.value) api({ action: "assign", item_type: item._type, item_id: item.id, group: e.target.value, order: 0 }); e.target.value = ""; }}
                    style={{ padding: 4, fontSize: 12, border: "1px solid #ddd", borderRadius: 4 }}>
                    <option value="">Move to...</option>
                    {navGroups.map((g) => <option key={g.name} value={g.name}>{g.icon} {g.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {navGroups.length === 0 && ungrouped.length === 0 && (
            <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
              No published apps yet. Publish an app from the Apps page.
            </div>
          )}
        </div>
      )}

      {tab === "org" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Organization</h2>
          {org && (
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#666" }}>Name:</span><strong>{org.name}</strong>
                <span style={{ color: "#666" }}>Slug:</span><code>{org.slug}</code>
                <span style={{ color: "#666" }}>Plan:</span><span>{org.plan}</span>
              </div>
            </div>
          )}

          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Access Control</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { href: "/-/users", icon: "\u{1F465}", title: "Users", desc: "Manage users, profiles, roles" },
              { href: "/-/roles", icon: "\u{1F6E1}", title: "Roles", desc: "Define roles and permissions" },
              { href: "/-/permissions", icon: "\u{1F511}", title: "Permissions", desc: "System + custom permissions" },
            ].map((c) => (
              <a key={c.href} href={c.href} style={{ display: "block", padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textDecoration: "none", color: "#333", textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>{c.icon}</div>
                <strong>{c.title}</strong>
                <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>{c.desc}</p>
              </a>
            ))}
          </div>

          <h3 style={{ margin: "24px 0 8px", fontSize: 15 }}>Permission Model</h3>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, fontSize: 13, lineHeight: 1.8 }}>
            <code>app.{"{slug}"}</code> — who can <strong>see</strong> an app (auto-created on publish)<br />
            System permissions — what users can <strong>do</strong> inside (<code>db.view</code>, <code>db.create</code>...)<br />
            Custom permissions — app-specific logic (<code>app.simulator_control</code>)<br />
            Multi-role — permissions are the <strong>union</strong> of all assigned roles<br />
            <br />
            <strong>JS apps:</strong> <code>IoTStack.can("permission.name")</code><br />
            <strong>Python:</strong> <code>client.me()["permissions"]</code>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1, boxSizing: "border-box" };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 10px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const arrowBtn = { padding: "2px 8px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: 12, color: "#666" };
