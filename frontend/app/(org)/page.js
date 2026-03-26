"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../lib/user-context.js";

export default function HomePage() {
  const { user, org, navData, hasPermission } = useUser();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/init").catch(() => {});
  }, []);

  // Redirect to user's landing page if set
  useEffect(() => {
    if (user?.landing_page) {
      router.replace(user.landing_page);
    }
  }, [user]);

  if (!user) return null;
  if (user.landing_page) return <div style={{ padding: 32, color: "#666" }}>Redirecting...</div>;

  // Default home — welcome + quick links
  const apps = navData?.apps || [];
  const dashboards = navData?.dashboards || [];
  const published = [...dashboards.map((d) => ({ ...d, _type: "dashboard", _href: `/a/${d.slug}` })),
    ...apps.map((a) => ({ ...a, _type: a.app_type, _href: `/a/${a.slug}` }))];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 4px" }}>Welcome{user.first_name ? `, ${user.first_name}` : ""}</h1>
      <p style={{ color: "#666", margin: "0 0 24px" }}>{org?.name} — {org?.plan} plan</p>

      {/* Quick access to published apps */}
      {published.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Your Apps</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {published.filter((p) => !p.permission_id || hasPermission(p.permission_id)).map((p) => (
              <Link key={p.id} href={p._href} style={{
                display: "block", padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0",
                textDecoration: "none", color: "#333",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{p.icon || "\u{1F4CA}"}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{p._type}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Quick Actions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {hasPermission("dashboard.create") && (
          <Link href="/-/apps/new" style={actionCard}>
            <span style={{ fontSize: 20 }}>{"\u{2795}"}</span>
            <span>Create App</span>
          </Link>
        )}
        {hasPermission("db.view") && (
          <Link href="/-/databases" style={actionCard}>
            <span style={{ fontSize: 20 }}>{"\u{1F4BE}"}</span>
            <span>Databases</span>
          </Link>
        )}
        {hasPermission("files.view") && (
          <Link href="/-/files" style={actionCard}>
            <span style={{ fontSize: 20 }}>{"\u{1F4C1}"}</span>
            <span>Files</span>
          </Link>
        )}
        <Link href="/-/notebooks" style={actionCard}>
          <span style={{ fontSize: 20 }}>{"\u{1F4D3}"}</span>
          <span>Notebooks</span>
        </Link>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: "#999" }}>
        Tip: Set your landing page in your profile to go directly to your favorite app.
      </p>
    </div>
  );
}

const actionCard = {
  display: "flex", alignItems: "center", gap: 10, padding: 14, background: "#fff",
  borderRadius: 8, border: "1px solid #e2e8f0", textDecoration: "none", color: "#333", fontSize: 14,
};
