"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../lib/user-context.js";

export default function DashboardsPage() {
  const { user, hasPermission, hasFeature, refresh } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [error, setError] = useState("");

  useEffect(() => { loadDashboards(); }, []);

  const loadDashboards = () => {
    fetch("/api/dashboards").then((r) => r.ok ? r.json() : { dashboards: [] }).then((d) => setDashboards(d.dashboards || []));
  };

  if (!user) return null;

  const canCreate = hasPermission("dashboard.create");
  const canEdit = hasPermission("dashboard.edit");
  const canPublish = hasPermission("dashboard.publish");

  const createDashboard = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", slug: "", description: "" });
    setShowCreate(false);
    loadDashboards();
  };

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
          <button onClick={() => setShowCreate(!showCreate)} style={btnBlue}>
            {showCreate ? "Cancel" : "New Dashboard"}
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createDashboard} style={{ padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder="Dashboard Name" value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-/, "");
                setForm({ ...form, name, slug });
              }} style={inputStyle} />
            <input placeholder="slug" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              style={{ ...inputStyle, flex: "none", width: 160 }} />
          </div>
          <input placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />
          <button type="submit" style={btnBlue}>Create</button>
          {error && <p style={{ color: "#e53e3e", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}
        </form>
      )}

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

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
