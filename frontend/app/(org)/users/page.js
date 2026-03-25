"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../lib/user-context.js";

export default function UsersPage() {
  const { user, hasPermission } = useUser();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role_id: "" });
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/users").then((r) => r.ok ? r.json() : { users: [] }).then((d) => setUsers(d.users || []));
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ username: "", password: "", role_id: "" });
    loadData();
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadData();
  };

  const changeUserRole = async (userId, roleId) => {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: parseInt(roleId) }),
    });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 20px" }}>Users</h1>

      {hasPermission("users.create") && (
        <form onSubmit={createUser} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} />
          <input type="password" placeholder="Password (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
          <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: parseInt(e.target.value) || "" })} style={inputStyle}>
            <option value="">Select role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" style={btnBlue}>Add User</button>
        </form>
      )}
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px" }}>{error}</p>}

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
                {hasPermission("users.edit") ? (
                  <select value={u.role_id || ""} onChange={(e) => changeUserRole(u.id, e.target.value)} style={{ padding: 4, fontSize: 13 }}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                ) : (
                  u.role || u.role_name
                )}
              </td>
              <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={tdStyle}>
                {hasPermission("users.delete") && user.id !== u.id && (
                  <button onClick={() => deleteUser(u.id)} style={btnDanger}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left", fontSize: 13 };
const tdStyle = { border: "1px solid #ddd", padding: 8, fontSize: 13 };
