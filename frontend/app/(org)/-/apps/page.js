"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";

const APP_TYPES = [
  { id: "html", label: "HTML / JS", icon: "\u{1F310}", desc: "Static web app (HTML, CSS, JavaScript)" },
  { id: "dash", label: "Dash (Python)", icon: "\u{1F4CA}", desc: "Python Dash dashboard app" },
  { id: "visual", label: "Visual Flow", icon: "\u{1F9E9}", desc: "Block-based visual programming" },
];

export default function AppsPage() {
  const { user, hasFeature, refresh } = useUser();
  const [apps, setApps] = useState([]);

  useEffect(() => { loadApps(); }, []);

  const loadApps = () => {
    fetch("/api/apps").then((r) => r.ok ? r.json() : { apps: [] }).then((d) => setApps(d.apps || []));
  };

  if (!user) return null;

  if (!hasFeature("app_builder")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Apps</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          App Builder feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  const publishApp = async (id) => {
    await fetch(`/api/apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    loadApps();
    refresh();
  };

  const unpublishApp = async (id) => {
    await fetch(`/api/apps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });
    loadApps();
    refresh();
  };

  const deleteApp = async (id, name) => {
    if (!confirm(`Delete app "${name}"? This removes the app and its permission.`)) return;
    await fetch(`/api/apps/${id}`, { method: "DELETE" });
    loadApps();
    refresh();
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Apps</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            Build and deploy apps. Published apps appear in the navigation for permitted users.
          </p>
        </div>
        <Link href="/-/apps/new" style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>New App</Link>
      </div>

      {/* App list */}
      {apps.length > 0 ? (
        <div>
          {apps.map((app) => (
            <div key={app.id} style={{
              padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{app.icon}</span>
                  <strong>{app.name}</strong>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                    background: app.status === "published" ? "#f0fde8" : "#f7f7f7",
                    color: app.status === "published" ? "#38a169" : "#999",
                  }}>
                    {app.status}
                  </span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#e8f4ff", color: "#0070f3" }}>
                    {APP_TYPES.find((t) => t.id === app.app_type)?.label || app.app_type}
                  </span>
                </div>
                {app.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>{app.description}</p>}
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  <code>/apps/{app.slug}</code>
                  {app.permission_id && <span> &middot; <code>{app.permission_id}</code></span>}
                  {app.created_by_name && <span> &middot; by {app.created_by_name}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {app.status === "published" ? (
                  <>
                    <Link href={`/apps/${app.slug}`} style={{ ...btnSmall, color: "#0070f3", textDecoration: "none" }}>Open</Link>
                    <button onClick={() => unpublishApp(app.id)} style={{ ...btnSmall, color: "#f59e0b" }}>Unpublish</button>
                  </>
                ) : (
                  <button onClick={() => publishApp(app.id)} style={{ ...btnSmall, color: "#38a169", borderColor: "#38a169" }}>Publish</button>
                )}
                <button onClick={() => deleteApp(app.id, app.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u{1F4F1}"}</div>
          <h2 style={{ margin: "0 0 8px" }}>No Apps Yet</h2>
          <p style={{ color: "#666", fontSize: 14 }}>
            Create your first app. Three modes available:
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
            {APP_TYPES.map((t) => (
              <div key={t.id} style={{ textAlign: "center", fontSize: 13 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <strong>{t.label}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
