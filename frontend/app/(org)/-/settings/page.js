"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

export default function SettingsPage() {
  const { user, org, hasPermission, refresh } = useUser();
  const [tab, setTab] = useState("org");
  const [features, setFeatures] = useState([]);

  useEffect(() => {
    if (user?.is_super_admin || hasPermission("org.settings")) {
      fetch("/api/features").then((r) => r.ok ? r.json() : { features: [] }).then((d) => setFeatures(d.features || []));
    }
  }, [user]);

  if (!user) return null;

  const TABS = [
    { id: "org", label: "Organization", icon: "\u{1F3E2}" },
    { id: "features", label: "Features", icon: "\u{2699}" },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 16px" }}>Settings</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === t.id ? "#0070f3" : "transparent", color: tab === t.id ? "#fff" : "#666",
            borderRadius: "6px 6px 0 0",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab === "org" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Organization</h2>
          {org && (
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#666" }}>Name:</span><strong>{org.name}</strong>
                <span style={{ color: "#666" }}>Slug:</span><code>{org.slug}</code>
                <span style={{ color: "#666" }}>Plan:</span><span>{org.plan}</span>
              </div>
            </div>
          )}

          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Access Control</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { href: "/-/users", icon: "\u{1F465}", title: "Users", desc: "Manage users, profiles, roles" },
              { href: "/-/roles", icon: "\u{1F6E1}", title: "Roles", desc: "Define roles and permissions" },
              { href: "/-/permissions", icon: "\u{1F511}", title: "Permissions", desc: "System + custom permissions" },
            ].map((c) => (
              <a key={c.href} href={c.href} style={{ display: "block", padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textDecoration: "none", color: "#333", textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>{c.icon}</div>
                <strong>{c.title}</strong>
                <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>{c.desc}</p>
              </a>
            ))}
          </div>

          <h3 style={{ margin: "24px 0 8px", fontSize: 15 }}>Permission Model</h3>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, fontSize: 13, lineHeight: 1.8 }}>
            <code>app.{"{slug}"}</code> — who can <strong>see</strong> a published page (auto-created on publish)<br />
            System permissions — what users can <strong>do</strong> (<code>db.view</code>, <code>db.create</code>...)<br />
            Custom permissions — app-specific logic (<code>app.simulator_control</code>)<br />
            Multi-role — permissions are the <strong>union</strong> of all assigned roles<br />
            <br />
            <strong>JS apps:</strong> <code>IoTStack.can("permission.name")</code><br />
            <strong>Python:</strong> <code>client.me()["permissions"]</code>
          </div>
        </div>
      )}

      {tab === "features" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Organization Features</h2>
          <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px" }}>Features enabled for this organization. Managed by super admin.</p>
          {features.length > 0 ? (
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              {features.map((f, i) => (
                <div key={f.feature || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: i < features.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{f.feature}</strong>
                    {f.config && <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>{JSON.stringify(f.config)}</span>}
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#f0fde8", color: "#38a169", fontWeight: 600 }}>enabled</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
              No features configured. Contact admin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
