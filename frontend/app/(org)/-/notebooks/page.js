"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { DateTimeCell } from "../../../../lib/components/data-table.js";

export default function NotebooksPage() {
  const { user, hasFeature } = useUser();
  const [notebooks, setNotebooks] = useState([]);

  useEffect(() => { loadNotebooks(); }, []);

  const loadNotebooks = async () => {
    const res = await fetch("/api/pages?type=notebook");
    if (res.ok) {
      const d = await res.json();
      setNotebooks(d.pages || []);
    }
  };

  if (!user) return null;

  if (!hasFeature("notebooks")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Notebooks</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Notebooks feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Notebooks</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
            Jupyter notebooks from your workspace. Create new ones from the workspace sidebar.
          </p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "name", label: "Notebook", render: (v, row) => (
            <Link href={`/my/${row.id}`} style={{ color: "#1e293b", textDecoration: "none", fontWeight: 600 }}>
              <span style={{ marginRight: 6 }}>{row.icon}</span>{v}
            </Link>
          )},
          { key: "username", label: "Owner" },
          { key: "visibility", label: "Visibility", render: (v) => (
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
              background: v === "org" ? "#e8f4ff" : v === "public" ? "#f0fde8" : "#f1f5f9",
              color: v === "org" ? "#0070f3" : v === "public" ? "#15803d" : "#64748b",
            }}>{v}</span>
          )},
          { key: "updated_at", label: "Last Modified", render: (v) => v ? <DateTimeCell value={v} /> : null },
        ]}
        data={notebooks}
        searchKeys={["name", "username"]}
        onRowClick={(row) => window.location.href = `/my/${row.id}`}
        actions={(row) => (
          <Link href={`/my/${row.id}`} style={{
            padding: "2px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: 4,
            cursor: "pointer", fontSize: 11, color: "#3b82f6", textDecoration: "none",
          }}>Open</Link>
        )}
        emptyMessage="No notebooks yet. Create one from the + menu in the workspace sidebar."
      />

      <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
        Notebooks include pre-injected SDK helpers. See <a href="/-/sdk" style={{ color: "#3b82f6" }}>SDK Documentation</a> for code examples.
      </p>
    </div>
  );
}
