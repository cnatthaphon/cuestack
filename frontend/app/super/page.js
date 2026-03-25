"use client";

import { useEffect, useState } from "react";

export default function SuperAdmin() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [form, setForm] = useState({ name: "", slug: "", plan: "free" });
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "admin" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (!d.user?.is_super_admin) { window.location.href = "/"; return; }
      setUser(d.user);
    });
    loadData();
  }, []);

  const loadData = () => {
    fetch("/api/super/stats").then((r) => r.json()).then(setStats);
    fetch("/api/super/orgs").then((r) => r.json()).then((d) => setOrgs(d.orgs || []));
  };

  const selectOrg = async (org) => {
    setSelectedOrg(org);
    const res = await fetch(`/api/super/orgs/${org.id}/users`);
    const data = await res.json();
    setOrgUsers(data.users || []);
  };

  const createOrg = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/super/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", slug: "", plan: "free" });
    loadData();
  };

  const deleteOrg = async (id, name) => {
    if (!confirm(`Delete organization "${name}" and ALL its users/data?`)) return;
    await fetch(`/api/super/orgs/${id}`, { method: "DELETE" });
    setSelectedOrg(null);
    setOrgUsers([]);
    loadData();
  };

  const toggleActive = async (org) => {
    await fetch(`/api/super/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !org.is_active }),
    });
    loadData();
  };

  const createUserInOrg = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/super/orgs/${selectedOrg.id}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userForm),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setUserForm({ username: "", password: "", role: "admin" });
    selectOrg(selectedOrg);
    loadData();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <div style={{ padding: 40, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Super Admin</h1>
        <div>
          <span style={{ color: "#666", marginRight: 16 }}>{user.username} (super admin)</span>
          <button onClick={handleLogout} style={btnGray}>Logout</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: "#666" }}>ORGANIZATIONS</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.organizations}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: "#666" }}>USERS</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{stats.users}</div>
          </div>
        </div>
      )}

      {/* Create Org */}
      <h2 style={{ marginTop: 32 }}>Organizations</h2>
      <form onSubmit={createOrg} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Slug (lowercase)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} style={inputStyle} />
        <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={inputStyle}>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button type="submit" style={btnBlue}>Create</button>
      </form>
      {error && <p style={{ color: "#e53e3e" }}>{error}</p>}

      {/* Org Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Name", "Slug", "Plan", "Users", "Storage", "Active", "Actions"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id} style={selectedOrg?.id === org.id ? { background: "#e8f4ff" } : {}}>
              <td style={tdStyle}>
                <a href="#" onClick={(e) => { e.preventDefault(); selectOrg(org); }} style={{ color: "#0070f3" }}>{org.name}</a>
              </td>
              <td style={tdStyle}><code>{org.slug}</code></td>
              <td style={tdStyle}>{org.plan}</td>
              <td style={tdStyle}>{org.user_count}</td>
              <td style={tdStyle}>{org.storage_limit_mb} MB</td>
              <td style={tdStyle}>{org.is_active ? "Yes" : "No"}</td>
              <td style={tdStyle}>
                <button onClick={() => toggleActive(org)} style={{ ...btnSmall, marginRight: 4 }}>
                  {org.is_active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => deleteOrg(org.id, org.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Org Detail: Users */}
      {selectedOrg && (
        <div style={{ marginTop: 32 }}>
          <h2>{selectedOrg.name} — Users</h2>
          <form onSubmit={createUserInOrg} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Username" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} style={inputStyle} />
            <input type="password" placeholder="Password (min 8)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} style={inputStyle}>
              <option value="admin">admin</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" style={btnBlue}>Add User</button>
          </form>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["ID", "Username", "Role", "Created"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgUsers.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.id}</td>
                  <td style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>{u.role}</td>
                  <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" };
const btnSmall = { padding: "4px 8px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14 };
const cardStyle = { flex: 1, padding: 20, background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left", fontSize: 13 };
const tdStyle = { border: "1px solid #ddd", padding: 8, fontSize: 14 };
