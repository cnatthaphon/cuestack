"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateTimeCell } from "../../../../lib/components/data-table.js";

export default function ServicesPage() {
  const { user, hasPermission, hasFeature } = useUser();
  const [services, setServices] = useState([]);

  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    const res = await fetch("/api/services");
    if (res.ok) {
      const d = await res.json();
      setServices(d.services || []);
    }
  };

  if (!user) return null;

  const toggleService = async (page) => {
    const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});
    const isRunning = cfg.service_status === "running";
    await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { ...cfg, service_status: isRunning ? "stopped" : "running" } }),
    });
    loadServices();
  };

  const running = services.filter(s => {
    const cfg = typeof s.config === "string" ? JSON.parse(s.config) : (s.config || {});
    return cfg.service_status === "running";
  }).length;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Services</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
            Always-on processes from your workspace. Flag any Python or Visual Flow page as a service.
            {running > 0 && <span style={{ color: "#22c55e", fontWeight: 600, marginLeft: 8 }}>{running} running</span>}
          </p>
        </div>
        <button onClick={loadServices} style={{ padding: "7px 16px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Refresh</button>
      </div>

      <DataTable
        columns={[
          { key: "name", label: "Page", render: (v, row) => (
            <Link href={`/my/${row.id}`} style={{ color: "#1e293b", textDecoration: "none", fontWeight: 600 }}>
              <span style={{ marginRight: 6 }}>{row.icon}</span>{v}
            </Link>
          )},
          { key: "page_type", label: "Type", render: (v) => (
            <Badge color={v === "python" ? "#854d0e" : "#6366f1"} bg={v === "python" ? "#fefce8" : "#eef2ff"}>
              {v}
            </Badge>
          )},
          { key: "config", label: "Status", dataKey: "service_status", render: (v, row) => {
            const cfg = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
            const st = cfg.service_status || "stopped";
            return (
              <Badge
                color={st === "running" ? "#15803d" : st === "error" ? "#dc2626" : "#64748b"}
                bg={st === "running" ? "#f0fdf4" : st === "error" ? "#fef2f2" : "#f1f5f9"}
              >{st}</Badge>
            );
          }},
          { key: "config", label: "Error", dataKey: "service_error", render: (v, row) => {
            const cfg = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
            const err = cfg.service_error;
            return err ? <span style={{ fontSize: 11, color: "#dc2626" }}>{err}</span> : null;
          }},
          { key: "username", label: "Owner" },
          { key: "updated_at", label: "Updated", render: (v) => v ? <DateTimeCell value={v} /> : null },
        ]}
        data={services}
        searchKeys={["name", "page_type", "username"]}
        actions={(row) => {
          const cfg = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
          const isRunning = cfg.service_status === "running";
          return (
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => toggleService(row)} style={{
                padding: "2px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: 4,
                cursor: "pointer", fontSize: 11, color: isRunning ? "#dc2626" : "#15803d",
              }}>
                {isRunning ? "Stop" : "Start"}
              </button>
              <Link href={`/my/${row.id}`} style={{
                padding: "2px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: 4,
                cursor: "pointer", fontSize: 11, color: "#3b82f6", textDecoration: "none",
              }}>Edit</Link>
            </div>
          );
        }}
        emptyMessage="No services running. Open a Python or Visual Flow page and click 'Run as Service' to start one."
      />
    </div>
  );
}
