"use client";

import { useEffect, useState } from "react";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const loadUsers = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []));

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setCurrentUser(data.user));
    loadUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    setForm({ username: "", password: "", role: "viewer" });
    loadUsers();
  };

  const handleDelete = async (id) => {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadUsers();
  };

  const handleRoleChange = async (id, role) => {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    loadUsers();
  };

  return (
    <div style={{ padding: 40, maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>User Management</h1>
        <a href="/" style={{ color: "#0070f3" }}>← Dashboard</a>
      </div>

      <form onSubmit={handleCreate} style={{ marginBottom: 24, display: "flex", gap: 8 }}>
        <input
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password (min 8)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          style={inputStyle}
          autoComplete="new-password"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          style={inputStyle}
        >
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" style={btnStyle}>Add</button>
      </form>
      {error && <p style={{ color: "#e53e3e" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ID", "Username", "Role", "Created", "Actions"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={tdStyle}>{u.id}</td>
              <td style={tdStyle}>{u.username}</td>
              <td style={tdStyle}>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  style={{ padding: 4 }}
                >
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={tdStyle}>
                {currentUser && currentUser.id !== u.id && (
                  <button
                    onClick={() => handleDelete(u.id)}
                    style={{ color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14 };
const btnStyle = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left" };
const tdStyle = { border: "1px solid #ddd", padding: 8 };
