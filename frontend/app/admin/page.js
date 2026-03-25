"use client";

import { useEffect, useState } from "react";

export default function OrgAdmin() {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState("");

  // Forms
  const [userForm, setUserForm] = useState({ username: "", password: "", role_id: "" });
  const [roleForm, setRoleForm] = useState({ name: "", description: "", permissions: [] });
  const [permForm, setPermForm] = useState({ id: "", category: "custom", label: "", description: "" });

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setUser(d.user);
      setOrg(d.org);
    });
    loadAll();
  }, []);

  const loadAll = () => {
    fetch("/api/users").then((r) => r.ok ? r.json() : { users: [] }).then((d) => setUsers(d.users || []));
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
    fetch("/api/permissions").then((r) => r.ok ? r.json() : { permissions: [] }).then((d) => setPermissions(d.permissions || []));
  };

  // --- User CRUD ---
  const createUser = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userForm),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setUserForm({ username: "", password: "", role_id: "" });
    loadAll();
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadAll();
  };

  const changeUserRole = async (userId, roleId) => {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: parseInt(roleId) }),
    });
    loadAll();
  };

  // --- Role CRUD ---
  const createRole = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roleForm),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setRoleForm({ name: "", description: "", permissions: [] });
    loadAll();
  };

  const toggleRolePermission = async (roleId, permId, currentPerms) => {
    const newPerms = currentPerms.includes(permId)
      ? currentPerms.filter((p) => p !== permId)
      : [...currentPerms, permId];
    await fetch(`/api/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    loadAll();
  };

  const deleteRole = async (id) => {
    if (!confirm("Delete this role?")) return;
    const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error); return; }
    loadAll();
  };

  // --- Permission CRUD (app permissions) ---
  const createPermission = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permForm),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setPermForm({ id: "", category: "custom", label: "", description: "" });
    loadAll();
  };

  const deletePermission = async (id) => {
    if (!confirm(`Delete permission "${id}"?`)) return;
    await fetch(`/api/permissions/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadAll();
  };

  // --- Permission toggle for role form ---
  const toggleFormPerm = (permId) => {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permId)
        ? f.permissions.filter((p) => p !== permId)
        : [...f.permissions, permId],
    }));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user) return <p style={{ padding: 40 }}>Loading...</p>;

  // Group permissions by category
  const permsByCategory = permissions.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div style={{ padding: 40, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin Panel</h1>
          {org && <p style={{ color: "#666", margin: "4px 0 0" }}>{org.name} — {org.plan} plan</p>}
        </div>
        <div>
          <a href="/" style={{ marginRight: 16, color: "#0070f3" }}>Dashboard</a>
          <button onClick={handleLogout} style={btnGray}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginTop: 24, borderBottom: "2px solid #eee" }}>
        {["users", "roles", "permissions"].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(""); }}
            style={{
              padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: tab === t ? "#0070f3" : "transparent",
              color: tab === t ? "#fff" : "#666",
              borderRadius: "6px 6px 0 0",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#e53e3e", marginTop: 12 }}>{error}</p>}

      {/* === Users Tab === */}
      {tab === "users" && (
        <div style={{ marginTop: 16 }}>
          <form onSubmit={createUser} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Username" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} style={inputStyle} />
            <input type="password" placeholder="Password (min 8)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
            <select value={userForm.role_id} onChange={(e) => setUserForm({ ...userForm, role_id: parseInt(e.target.value) || "" })} style={inputStyle}>
              <option value="">Select role</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button type="submit" style={btnBlue}>Add</button>
          </form>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "Username", "Role", "Created", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.id}</td>
                  <td style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>
                    <select value={u.role_id || ""} onChange={(e) => changeUserRole(u.id, e.target.value)} style={{ padding: 4 }}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    {user.id !== u.id && <button onClick={() => deleteUser(u.id)} style={btnDanger}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* === Roles Tab === */}
      {tab === "roles" && (
        <div style={{ marginTop: 16 }}>
          <form onSubmit={createRole} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Role name" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} style={inputStyle} />
            <input placeholder="Description" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
            <button type="submit" style={btnBlue}>Create Role</button>
          </form>

          {/* Permission checkboxes for new role */}
          {roleForm.name && (
            <div style={{ marginBottom: 16, padding: 16, background: "#f7f7f7", borderRadius: 8 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Permissions for new role:</p>
              {Object.entries(permsByCategory).map(([cat, perms]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}>{cat}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    {perms.map((p) => (
                      <label key={p.id} style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={roleForm.permissions.includes(p.id)} onChange={() => toggleFormPerm(p.id)} style={{ marginRight: 4 }} />
                        {p.label || p.id}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Existing roles with permissions grid */}
          {roles.map((role) => (
            <div key={role.id} style={{ marginBottom: 16, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{role.name}</strong>
                  {role.is_default && <span style={{ marginLeft: 8, fontSize: 11, color: "#999" }}>default</span>}
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>({role.user_count} users)</span>
                </div>
                <button onClick={() => deleteRole(role.id)} style={btnDanger}>Delete</button>
              </div>
              <p style={{ margin: "4px 0 8px", color: "#666", fontSize: 13 }}>{role.description}</p>
              {Object.entries(permsByCategory).map(([cat, perms]) => (
                <div key={cat} style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase" }}>{cat}: </span>
                  {perms.map((p) => (
                    <label key={p.id} style={{ fontSize: 12, marginRight: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={role.permissions?.includes(p.id)}
                        onChange={() => toggleRolePermission(role.id, p.id, role.permissions || [])}
                        style={{ marginRight: 2 }}
                      />
                      {p.label || p.id}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* === Permissions Tab (App Permissions) === */}
      {tab === "permissions" && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px" }}>App Permissions (custom)</h3>
          <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px" }}>
            Create custom permissions for your apps and dashboards. These can be assigned to roles.
          </p>
          <form onSubmit={createPermission} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="ID (lowercase)" value={permForm.id} onChange={(e) => setPermForm({ ...permForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} style={inputStyle} />
            <input placeholder="Label" value={permForm.label} onChange={(e) => setPermForm({ ...permForm, label: e.target.value })} style={inputStyle} />
            <input placeholder="Category" value={permForm.category} onChange={(e) => setPermForm({ ...permForm, category: e.target.value })} style={inputStyle} />
            <button type="submit" style={btnBlue}>Create</button>
          </form>

          <h4 style={{ margin: "24px 0 8px" }}>All Permissions</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "Label", "Category", "Type", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}><code style={{ fontSize: 12 }}>{p.id}</code></td>
                  <td style={tdStyle}>{p.label || p.id}</td>
                  <td style={tdStyle}>{p.category}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: p.type === "system" ? "#e8f4ff" : "#f0fde8", color: p.type === "system" ? "#0070f3" : "#38a169" }}>
                      {p.type}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {p.type === "app" && <button onClick={() => deletePermission(p.id)} style={btnDanger}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left", fontSize: 13 };
const tdStyle = { border: "1px solid #ddd", padding: 8, fontSize: 13 };
