"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell, DateTimeCell } from "../../../../lib/components/data-table.js";

export default function ApiKeysPage() {
  const { user } = useUser();
  const [keys, setKeys] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/keys").then((r) => r.ok ? r.json() : { keys: [] }).then((d) => setKeys(d.keys || []));
  };

  const toggleKeyActive = async (keyId, currentActive) => {
    await fetch(`/api/keys/${keyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    loadData();
  };

  const deleteKey = async (id, name) => {
    if (!confirm(`Revoke API key "${name}"?`)) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 8px" }}>API Keys</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Create API keys for external access to your data. Keys are shown only once — save them securely.
      </p>

      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "key_prefix", label: "Prefix", render: (v) => <code style={{ fontSize: 12 }}>{v}...</code> },
          { key: "permissions", label: "Permissions", sortable: false, render: (v) => { const perms = typeof v === "string" ? JSON.parse(v) : (v || []); return <span style={{ fontSize: 11 }}>{perms.map((p) => `${p.table}(${p.read ? "R" : ""}${p.write ? "W" : ""})`).join(", ") || "none"}</span>; } },
          { key: "is_active", label: "Active", render: (v, row) => (
            <button onClick={() => toggleKeyActive(row.id, row.is_active)} style={{ ...btnSmall, color: row.is_active ? "#38a169" : "#e53e3e" }}>
              {row.is_active ? "Active" : "Disabled"}
            </button>
          ) },
          { key: "last_used_at", label: "Last Used", render: (v) => v ? <DateTimeCell value={v} /> : "Never" },
          { key: "expires_at", label: "Expires", render: (v) => v ? <DateCell value={v} /> : "Never" },
          { key: "created_at", label: "Created", render: (v) => <DateCell value={v} /> },
        ]}
        data={keys}
        searchKeys={["name", "key_prefix"]}
        emptyMessage="No API keys yet."
        toolbar={<Link href="/-/api-keys/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>New API Key</Link>}
        actions={(row) => (
          <button onClick={() => deleteKey(row.id, row.name)} style={btnDanger}>Revoke</button>
        )}
      />
    </div>
  );
}

const btnSmall = { padding: "4px 8px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
