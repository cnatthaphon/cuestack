"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge } from "../../../../lib/components/data-table.js";

export default function RolesPage() {
  const { user } = useUser();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", permissions: [] });
  const [editingRole, setEditingRole] = useState(null);
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
    setShowCreate(false);
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
    if (editingRole?.id === id) setEditingRole(null);
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

  const columns = [
    { key: "name", label: "Name", render: (v, row) => (
      <div>
        <strong>{v}</strong>
        {row.is_default && <Badge color="#666" bg="#f0f0f0">default</Badge>}
      </div>
    )},
    { key: "description", label: "Description" },
    { key: "user_count", label: "Users", width: 70 },
    { key: "permissions", label: "Permissions", render: (v) => (
      <span style={{ fontSize: 12, color: "#666" }}>{(v || []).length} assigned</span>
    )},
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 16px" }}>Roles</h1>

      {showCreate && (
        <div style={{ marginBottom: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Create Role</h3>
          <form onSubmit={createRole}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input placeholder="Role name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
              <button type="submit" style={btnBlue}>Create</button>
              <button type="button" onClick={() => setShowCreate(false)} style={btnGray}>Cancel</button>
            </div>
          </form>
          {form.name && <PermissionGrid permissions={permsByCategory} selected={form.permissions} onToggle={toggleFormPerm} />}
          {error && <p style={{ color: "#e53e3e", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}
        </div>
      )}

      <DataTable
        columns={columns}
        data={roles}
        searchKeys={["name", "description"]}
        onRowClick={(row) => setEditingRole(editingRole?.id === row.id ? null : row)}
        actions={(row) => (
          <button onClick={() => deleteRole(row.id)} style={btnDanger}>Delete</button>
        )}
        toolbar={
          <button onClick={() => setShowCreate(!showCreate)} style={btnBlue}>
            {showCreate ? "Cancel" : "New Role"}
          </button>
        }
        emptyMessage="No roles"
      />

      {/* Expanded permission editor for selected role */}
      {editingRole && (
        <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #0070f3" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              Permissions for: <strong>{editingRole.name}</strong>
              <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>({editingRole.user_count} users)</span>
            </h3>
            <button onClick={() => setEditingRole(null)} style={btnGray}>Close</button>
          </div>
          <PermissionGrid
            permissions={permsByCategory}
            selected={editingRole.permissions || []}
            onToggle={(permId) => toggleRolePermission(editingRole.id, permId, editingRole.permissions || [])}
          />
        </div>
      )}
    </div>
  );
}

function PermissionGrid({ permissions, selected, onToggle }) {
  return (
    <div>
      {Object.entries(permissions).map(([cat, perms]) => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>{cat}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {perms.map((p) => (
              <label key={p.id} style={{
                fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4,
                background: selected.includes(p.id) ? "#e8f4ff" : "#f7f7f7",
                border: selected.includes(p.id) ? "1px solid #0070f3" : "1px solid #e2e8f0",
              }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => onToggle(p.id)}
                  style={{ marginRight: 4 }} />
                {p.label || p.id}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
