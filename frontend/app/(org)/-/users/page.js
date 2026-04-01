"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell } from "../../../../lib/components/data-table.js";

export default function UsersPage() {
  const { user, hasPermission } = useUser();
  const [users, setUsers] = useState([]);

  useEffect(() => { loadData(); }, []);
  const loadData = () => {
    fetch("/api/users").then((r) => r.ok ? r.json() : { users: [] }).then((d) => setUsers(d.users || []));
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadData();
  };

  const bulkDelete = async (ids) => {
    if (!confirm(`Delete ${ids.length} users?`)) return;
    for (const id of ids) { if (id !== user.id) await fetch(`/api/users/${id}`, { method: "DELETE" }); }
    loadData();
  };

  if (!user) return null;

  const columns = [
    { key: "username", label: "Username", render: (v, row) => (
      <Link href={`/-/users/${row.id}`} style={{ color: "#0070f3", textDecoration: "none", fontWeight: 500 }}>{v}</Link>
    )},
    { key: "first_name", label: "Name", render: (_, row) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      return name || <span style={{ color: "#ccc" }}>\u2014</span>;
    }},
    { key: "department", label: "Department" },
    { key: "role_names", label: "Roles", render: (v) => v ? (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {v.split(", ").map((r) => <Badge key={r} color="#0070f3" bg="#e8f4ff">{r}</Badge>)}
      </div>
    ) : <span style={{ color: "#ccc" }}>\u2014</span>},
    { key: "email", label: "Email" },
    { key: "created_at", label: "Created", render: (v) => <DateCell value={v} /> },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ margin: "0 0 16px" }}>Users</h1>
      <DataTable
        columns={columns}
        data={users}
        searchKeys={["username", "first_name", "last_name", "email", "department", "role_names"]}
        bulkActions={hasPermission("users.delete") ? [
          { label: "Delete Selected", onClick: bulkDelete, color: "#e53e3e" },
        ] : undefined}
        actions={(row) => (
          <div style={{ display: "flex", gap: 4 }}>
            <Link href={`/-/users/${row.id}`} style={{ color: "#0070f3", textDecoration: "none", fontSize: 12 }}>Edit</Link>
            {hasPermission("users.delete") && row.id !== user.id && (
              <button onClick={() => deleteUser(row.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 }}>Delete</button>
            )}
          </div>
        )}
        toolbar={hasPermission("users.create") && (
          <Link href="/-/users/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>Add User</Link>
        )}
        emptyMessage="No users"
      />
    </div>
  );
}
