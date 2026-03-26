"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell } from "../../../../lib/components/data-table.js";

export default function UsersPage() {
  const { user, hasPermission } = useUser();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
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
    setShowCreate(false);
    loadData();
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadData();
  };

  const bulkDelete = async (ids) => {
    if (!confirm(`Delete ${ids.length} users?`)) return;
    for (const id of ids) {
      if (id !== user.id) await fetch(`/api/users/${id}`, { method: "DELETE" });
    }
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

  const getRoleName = (roleId) => roles.find((r) => r.id === roleId)?.name || "\u2014";

  const columns = [
    { key: "id", label: "ID", width: 60 },
    { key: "username", label: "Username" },
    {
      key: "role_id", label: "Role",
      render: (val, row) => hasPermission("users.edit") ? (
        <select value={val || ""} onChange={(e) => changeUserRole(row.id, e.target.value)}
          style={{ padding: 4, fontSize: 13, border: "1px solid #ddd", borderRadius: 4 }}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      ) : (
        <Badge color="#0070f3" bg="#e8f4ff">{getRoleName(val)}</Badge>
      ),
    },
    { key: "created_at", label: "Created", render: (v) => <DateCell value={v} /> },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 16px" }}>Users</h1>

      {showCreate && (
        <form onSubmit={createUser} style={{ display: "flex", gap: 8, marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} />
          <input type="password" placeholder="Password (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
          <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: parseInt(e.target.value) || "" })} style={inputStyle}>
            <option value="">Select role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" style={btnBlue}>Create</button>
          <button type="button" onClick={() => setShowCreate(false)} style={btnGray}>Cancel</button>
        </form>
      )}
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

      <DataTable
        columns={columns}
        data={users}
        searchKeys={["username"]}
        bulkActions={hasPermission("users.delete") ? [
          { label: "Delete Selected", onClick: bulkDelete, color: "#e53e3e" },
        ] : undefined}
        actions={hasPermission("users.delete") ? (row) => (
          row.id !== user.id ? (
            <button onClick={() => deleteUser(row.id)} style={btnDanger}>Delete</button>
          ) : null
        ) : undefined}
        toolbar={hasPermission("users.create") && (
          <button onClick={() => setShowCreate(!showCreate)} style={btnBlue}>
            {showCreate ? "Cancel" : "Add User"}
          </button>
        )}
        emptyMessage="No users"
      />
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
