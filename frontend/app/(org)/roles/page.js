"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../lib/user-context.js";

export default function RolesPage() {
  const { user } = useUser();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", permissions: [] });
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
    fetch("/api/permissions").then((r) => r.ok ? r.json() : { permissions: [] }).then((d) => setPermissions(d.permissions || []));
  };

  const createRole = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", description: "", permissions: [] });
    loadData();
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
    loadData();
  };

  const deleteRole = async (id) => {
    if (!confirm("Delete this role?")) return;
    const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error); return; }
    loadData();
  };

  const toggleFormPerm = (permId) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permId)
        ? f.permissions.filter((p) => p !== permId)
        : [...f.permissions, permId],
    }));
  };

  if (!user) return null;

  const permsByCategory = permissions.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 20px" }}>Roles</h1>

      <form onSubmit={createRole} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Role name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
        <button type="submit" style={btnBlue}>Create Role</button>
      </form>
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px" }}>{error}</p>}

      {form.name && (
        <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13 }}>Permissions for new role:</p>
          {Object.entries(permsByCategory).map(([cat, perms]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}>{cat}</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {perms.map((p) => (
                  <label key={p.id} style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.permissions.includes(p.id)} onChange={() => toggleFormPerm(p.id)} style={{ marginRight: 4 }} />
                    {p.label || p.id}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {roles.map((role) => (
        <div key={role.id} style={{ marginBottom: 16, padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
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
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
