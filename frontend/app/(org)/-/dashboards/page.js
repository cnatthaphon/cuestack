"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";

export default function DashboardsPage() {
  const { user, hasPermission, hasFeature, refresh } = useUser();
  const [dashboards, setDashboards] = useState([]);

  useEffect(() => { loadDashboards(); }, []);

  const loadDashboards = () => {
    fetch("/api/dashboards").then((r) => r.ok ? r.json() : { dashboards: [] }).then((d) => setDashboards(d.dashboards || []));
  };

  if (!user) return null;

  const canCreate = hasPermission("dashboard.create");
  const canEdit = hasPermission("dashboard.edit");
  const canPublish = hasPermission("dashboard.publish");

  const publishDash = async (id) => {
    await fetch(`/api/dashboards/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    loadDashboards();
    refresh();
  };

  const unpublishDash = async (id) => {
    await fetch(`/api/dashboards/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });
    loadDashboards();
    refresh();
  };

  const deleteDash = async (id, name) => {
    if (!confirm(`Delete dashboard "${name}"?`)) return;
    await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    loadDashboards();
    refresh();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Dashboards</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>Build data dashboards with widgets. Published dashboards appear in navigation.</p>
        </div>
        {canCreate && (
          <Link href="/-/dashboards/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>New Dashboard</Link>
        )}
      </div>

      {dashboards.length > 0 ? (
        <div>
          {dashboards.map((d) => (
            <div key={d.id} style={{ padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{d.name}</strong>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: d.status === "published" ? "#f0fde8" : "#f7f7f7", color: d.status === "published" ? "#38a169" : "#999" }}>
                    {d.status}
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>{d.widget_count || 0} widgets</span>
                </div>
                {d.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>{d.description}</p>}
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  {d.created_by_name && <span>by {d.created_by_name} &middot; </span>}
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {canEdit && (
                  <Link href={`/dashboards/${d.id}/edit`} style={{ ...btnSmall, color: "#0070f3", textDecoration: "none" }}>Edit</Link>
                )}
                {d.status === "published" ? (
                  <>
                    <Link href={`/dashboards/${d.id}`} style={{ ...btnSmall, color: "#0070f3", textDecoration: "none" }}>View</Link>
                    {canPublish && <button onClick={() => unpublishDash(d.id)} style={{ ...btnSmall, color: "#f59e0b" }}>Unpublish</button>}
                  </>
                ) : (
                  canPublish && <button onClick={() => publishDash(d.id)} style={{ ...btnSmall, color: "#38a169", borderColor: "#38a169" }}>Publish</button>
                )}
                {canEdit && <button onClick={() => deleteDash(d.id, d.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          No dashboards yet. {canCreate ? "Create your first dashboard." : ""}
        </div>
      )}
    </div>
  );
}

const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
