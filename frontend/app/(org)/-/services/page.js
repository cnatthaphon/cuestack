"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell } from "../../../../lib/components/data-table.js";

export default function ServicesPage() {
  const { user, hasPermission, hasFeature } = useUser();
  const [services, setServices] = useState([]);

  useEffect(() => { loadServices(); }, []);

  const loadServices = () => {
    fetch("/api/services").then((r) => r.ok ? r.json() : { services: [] }).then((d) => setServices(d.services || []));
  };

  if (!user) return null;

  if (!hasFeature("python_services")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Services</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Python Services feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  const toggleService = async (id, currentStatus) => {
    const action = currentStatus === "running" ? "stop" : "start";
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    loadServices();
  };

  const deleteService = async (id, name) => {
    if (!confirm(`Delete service "${name}"?`)) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    loadServices();
  };

  const canManage = hasPermission("services.manage");

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Services</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            Deploy Python services — FastAPI endpoints, scheduled jobs, background workers.
          </p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: "name", label: "Name", render: (v) => <strong>{v}</strong> },
          { key: "status", label: "Status", render: (v) => (
            <Badge
              color={v === "running" ? "#38a169" : v === "error" ? "#e53e3e" : "#999"}
              bg={v === "running" ? "#f0fde8" : v === "error" ? "#fef2f2" : "#f7f7f7"}
            >{v}</Badge>
          ) },
          { key: "description", label: "Description" },
          { key: "entrypoint", label: "Entrypoint", render: (v) => <code>{v}</code> },
          { key: "created_by_name", label: "Created By" },
          { key: "created_at", label: "Created", render: (v) => <DateCell value={v} /> },
        ]}
        data={services}
        searchKeys={["name", "status", "description", "entrypoint"]}
        emptyMessage={`No services yet. ${canManage ? "Create one to get started." : ""}`}
        toolbar={canManage ? <Link href="/-/services/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>New Service</Link> : undefined}
        actions={canManage ? (row) => (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => toggleService(row.id, row.status)} style={{
              ...btnSmall,
              color: row.status === "running" ? "#e53e3e" : "#38a169",
              borderColor: row.status === "running" ? "#e53e3e" : "#38a169",
            }}>
              {row.status === "running" ? "Stop" : "Start"}
            </button>
            <button onClick={() => deleteService(row.id, row.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
          </div>
        ) : undefined}
      />
    </div>
  );
}

const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
