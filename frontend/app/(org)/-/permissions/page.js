"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge } from "../../../../lib/components/data-table.js";

export default function PermissionsPage() {
  const { user } = useUser();
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState({ id: "", category: "custom", label: "", description: "" });
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/permissions").then((r) => r.ok ? r.json() : { permissions: [] }).then((d) => setPermissions(d.permissions || []));
  };

  const createPermission = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ id: "", category: "custom", label: "", description: "" });
    loadData();
  };

  const deletePermission = async (id) => {
    if (!confirm(`Delete permission "${id}"?`)) return;
    await fetch(`/api/permissions/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Permissions</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        System permissions are platform-defined. Create custom app permissions for your organization's apps and dashboards.
      </p>

      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Create App Permission</h3>
      <form onSubmit={createPermission} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input placeholder="ID (lowercase)" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} style={inputStyle} />
        <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} style={inputStyle} />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle} />
        <button type="submit" style={btnBlue}>Create</button>
      </form>
      {error && <p style={{ color: "#e53e3e", margin: "-12px 0 12px" }}>{error}</p>}

      <DataTable
        columns={[
          { key: "id", label: "ID", render: (v) => <code style={{ fontSize: 12 }}>{v}</code> },
          { key: "label", label: "Label", render: (v, row) => v || row.id },
          { key: "category", label: "Category" },
          { key: "type", label: "Type", render: (v) => <Badge color={v === "system" ? "#0070f3" : "#38a169"} bg={v === "system" ? "#e8f4ff" : "#f0fde8"}>{v}</Badge> },
        ]}
        data={permissions}
        searchKeys={["id", "label", "category", "type"]}
        emptyMessage="No permissions found."
        actions={(row) => row.type === "app" ? (
          <button onClick={() => deletePermission(row.id)} style={btnDanger}>Delete</button>
        ) : null}
      />
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
