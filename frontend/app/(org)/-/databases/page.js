"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell } from "../../../../lib/components/data-table.js";

export default function DatabasesPage() {
  const { user, hasPermission } = useUser();
  const [tables, setTables] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  };

  const deleteTable = async (id, name) => {
    if (!confirm(`Delete table "${name}" and ALL its data?`)) return;
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 8px" }}>Databases</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Create tables to store your organization's data. Use API keys to insert and query data via the External API.
      </p>

      <DataTable
        columns={[
          { key: "name", label: "Name", render: (v) => <code style={{ fontSize: 12 }}>{v}</code> },
          { key: "db_type", label: "Type", render: (v) => <Badge color={v === "analytical" ? "#0070f3" : "#92400e"} bg={v === "analytical" ? "#e8f4ff" : "#fef3c7"}>{v}</Badge> },
          { key: "columns", label: "Columns", sortable: false, render: (v) => { const cols = typeof v === "string" ? JSON.parse(v) : (v || []); return <span style={{ fontSize: 12 }}>{cols.map((c) => `${c.name}:${c.type}`).join(", ")}</span>; } },
          { key: "row_count", label: "Rows", render: (v) => v || 0 },
          { key: "description", label: "Description" },
          { key: "created_at", label: "Created", render: (v) => <DateCell value={v} /> },
        ]}
        data={tables}
        searchKeys={["name", "db_type", "description"]}
        emptyMessage="No tables yet."
        toolbar={hasPermission("db.create") ? <Link href="/-/databases/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>New Table</Link> : undefined}
        actions={hasPermission("db.delete") ? (row) => (
          <button onClick={() => deleteTable(row.id, row.name)} style={btnDanger}>Delete</button>
        ) : undefined}
      />
    </div>
  );
}

const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
