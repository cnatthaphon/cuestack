"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge } from "../../../../lib/components/data-table.js";

export default function RolesPage() {
  const { user, hasPermission } = useUser();
  const [roles, setRoles] = useState([]);

  useEffect(() => { loadData(); }, []);
  const loadData = () => {
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
  };

  const deleteRole = async (id) => {
    if (!confirm("Delete this role?")) return;
    const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  };

  const bulkDelete = async (ids) => {
    if (!confirm(`Delete ${ids.length} roles?`)) return;
    for (const id of ids) await fetch(`/api/roles/${id}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  const columns = [
    { key: "name", label: "Name", render: (v, row) => (
      <Link href={`/-/roles/${row.id}`} style={{ color: "#0070f3", textDecoration: "none", fontWeight: 500 }}>
        {v}
        {row.is_default && <Badge color="#666" bg="#f0f0f0" style={{ marginLeft: 6 }}>default</Badge>}
      </Link>
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
      <DataTable
        columns={columns}
        data={roles}
        searchKeys={["name", "description"]}
        bulkActions={[
          { label: "Delete Selected", onClick: bulkDelete, color: "#e53e3e" },
        ]}
        actions={(row) => (
          <div style={{ display: "flex", gap: 4 }}>
            <Link href={`/-/roles/${row.id}`} style={{ color: "#0070f3", textDecoration: "none", fontSize: 12 }}>Edit</Link>
            <button onClick={() => deleteRole(row.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 }}>Delete</button>
          </div>
        )}
        toolbar={
          <Link href="/-/roles/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>New Role</Link>
        }
        emptyMessage="No roles"
      />
    </div>
  );
}
