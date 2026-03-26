"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "../../lib/user-context.js";
import TopBar from "../../lib/components/top-bar.js";

// Nav organized into sections
// System pages under /-/ prefix (reserved, never conflicts with user content)
// Published content: /d/[slug] (dashboards), /a/[slug] (apps)
// Public content: /public/[org]/d/[slug], /public/[org]/a/[slug]
const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/", label: "Dashboard", icon: "\u25A6", permission: null, feature: null },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/-/dashboards", label: "Dashboards", icon: "\u{1F4CA}", permission: "dashboard.view", feature: "dashboards" },
      { href: "/-/notebooks", label: "Notebooks", icon: "\u{1F4D3}", permission: null, feature: "notebooks" },
      { href: "/-/apps", label: "Apps", icon: "\u{1F4F1}", permission: null, feature: "app_builder" },
      { href: "/-/services", label: "Services", icon: "\u2699", permission: null, feature: "python_services" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/-/databases", label: "Databases", icon: "\u{1F4BE}", permission: "db.view", feature: "databases" },
      { href: "/-/files", label: "Files", icon: "\u{1F4C1}", permission: "files.view", feature: null },
      { href: "/-/api-keys", label: "API Keys", icon: "\u{1F510}", permission: "org.settings", feature: "api" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/-/users", label: "Users", icon: "\u{1F465}", permission: "users.view", feature: null },
      { href: "/-/roles", label: "Roles", icon: "\u{1F6E1}", permission: "roles.manage", feature: null },
      { href: "/-/permissions", label: "Permissions", icon: "\u{1F511}", permission: "permissions.manage", feature: null },
    ],
  },
];

export default function OrgLayout({ children }) {
  return (
    <UserProvider>
      <OrgShell>{children}</OrgShell>
    </UserProvider>
  );
}

function OrgShell({ children }) {
  const { user, org, orgApps, orgDashboards, loading, logout, hasPermission } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  if (loading) {
    return <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading...</div>;
  }

  if (!user) return null;

  // Filter nav items by permission + feature
  const filterItems = (items) => items.filter((item) => {
    if (item.permission && !user.is_super_admin && !user.permissions?.includes(item.permission)) return false;
    if (item.feature && !user.features?.includes(item.feature)) return false;
    return true;
  });

  // Dynamic dashboard nav — published dashboards under /d/[slug]
  const dashNav = (orgDashboards || [])
    .filter((d) => !d.permission_id || hasPermission(d.permission_id))
    .map((d) => ({
      href: `/d/${d.slug}`,
      label: d.name,
      icon: "\u{1F4CA}",
      permission: d.permission_id,
    }));

  // Dynamic app nav — published apps under /a/[slug]
  const appNav = (orgApps || [])
    .filter((app) => !app.permission_id || hasPermission(app.permission_id))
    .map((app) => ({
      href: `/a/${app.slug}`,
      label: app.name,
      icon: app.icon || "\u{1F4F1}",
      permission: app.permission_id,
      feature: null,
      isApp: true,
    }));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Left Nav */}
      <nav style={{
        width: collapsed ? 56 : 220,
        background: "#1a1a2e",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        flexShrink: 0,
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 10,
        overflowY: "auto",
        overflowX: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: collapsed ? "16px 8px" : "16px 16px", borderBottom: "1px solid #2a2a4a" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
            {!collapsed && (
              <Link href="/" style={{ fontWeight: 700, fontSize: 16, color: "#fff", textDecoration: "none" }}>
                IoT Stack
              </Link>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "\u25B6" : "\u25C0"}
            </button>
          </div>
          {!collapsed && org && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              {org.name} \u2022 {org.plan}
            </div>
          )}
        </div>

        {/* Nav Sections */}
        <div style={{ flex: 1, padding: "4px 0", overflowY: "auto" }}>
          {NAV_SECTIONS.map((section, si) => {
            const items = filterItems(section.items);
            if (items.length === 0) return null;
            return (
              <div key={si}>
                {section.label && !collapsed && (
                  <div style={{ padding: "12px 16px 4px", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                    {section.label}
                  </div>
                )}
                {section.label && collapsed && <div style={{ borderTop: "1px solid #2a2a4a", margin: "4px 12px" }} />}
                {items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
              </div>
            );
          })}

          {/* Published Dashboards — dynamic */}
          {dashNav.length > 0 && (
            <div>
              {!collapsed && <div style={sectionLabel}>My Dashboards</div>}
              {collapsed && <div style={{ borderTop: "1px solid #2a2a4a", margin: "4px 12px" }} />}
              {dashNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
            </div>
          )}

          {/* Published Apps — dynamic */}
          {appNav.length > 0 && (
            <div>
              {!collapsed && <div style={sectionLabel}>My Apps</div>}
              {collapsed && <div style={{ borderTop: "1px solid #2a2a4a", margin: "4px 12px" }} />}
              {appNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
            </div>
          )}
        </div>

        {/* Nav Footer — org info */}
        <div style={{ padding: collapsed ? "12px 8px" : "12px 16px", borderTop: "1px solid #2a2a4a" }}>
          {!collapsed && org && (
            <div style={{ fontSize: 11, color: "#555", textAlign: "center" }}>
              {org.name} &middot; {org.plan}
            </div>
          )}
        </div>
      </nav>

      {/* Main Area */}
      <div style={{
        flex: 1,
        marginLeft: collapsed ? 56 : 220,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        transition: "margin-left 0.2s ease",
      }}>
        {/* Top Bar */}
        <header style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "8px 24px", background: "#fff", borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}>
          <TopBar />
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: 32, background: "#f8f9fa" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, pathname, collapsed }) {
  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  return (
    <Link href={item.href} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
      color: active ? "#fff" : "#8a8aa0",
      background: active ? "rgba(0,112,243,0.2)" : "transparent",
      borderLeft: active ? "3px solid #0070f3" : "3px solid transparent",
      textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
      transition: "all 0.15s", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 14, width: 22, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

const sectionLabel = { padding: "12px 16px 4px", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 };
