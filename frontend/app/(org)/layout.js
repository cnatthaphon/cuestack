"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "../../lib/user-context.js";

// Nav organized into sections
const NAV_SECTIONS = [
  {
    label: null, // no section header for top items
    items: [
      { href: "/", label: "Dashboard", icon: "\u25A6", permission: null, feature: null },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboards", label: "Dashboards", icon: "\u{1F4CA}", permission: "dashboard.view", feature: "dashboards" },
      { href: "/notebooks", label: "Notebooks", icon: "\u{1F4D3}", permission: null, feature: "notebooks" },
      { href: "/apps", label: "Apps", icon: "\u{1F4F1}", permission: null, feature: "app_builder" },
      { href: "/services", label: "Services", icon: "\u2699", permission: null, feature: "python_services" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/databases", label: "Databases", icon: "\u{1F4BE}", permission: "db.view", feature: "databases" },
      { href: "/files", label: "Files", icon: "\u{1F4C1}", permission: "files.view", feature: null },
      { href: "/api-keys", label: "API Keys", icon: "\u{1F510}", permission: "org.settings", feature: "api" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/users", label: "Users", icon: "\u{1F465}", permission: "users.view", feature: null },
      { href: "/roles", label: "Roles", icon: "\u{1F6E1}", permission: "roles.manage", feature: null },
      { href: "/permissions", label: "Permissions", icon: "\u{1F511}", permission: "permissions.manage", feature: null },
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

  // Dynamic dashboard nav — published dashboards the user has permission for
  const dashNav = (orgDashboards || [])
    .filter((d) => !d.permission_id || hasPermission(d.permission_id))
    .map((d) => ({
      href: `/dashboards/${d.id}`,
      label: d.name,
      icon: "\u{1F4CA}",
      permission: d.permission_id,
    }));

  // Dynamic app nav — published apps the user has permission for
  const appNav = (orgApps || [])
    .filter((app) => !app.permission_id || hasPermission(app.permission_id))
    .map((app) => ({
      href: `/apps/${app.slug}`,
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

        {/* User Footer */}
        <div style={{ padding: collapsed ? "12px 8px" : "12px 16px", borderTop: "1px solid #2a2a4a" }}>
          {!collapsed && (
            <div style={{ fontSize: 12, color: "#8a8aa0", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.username}
              {user.role_name && <span style={{ color: "#555" }}> \u2022 {user.role_name}</span>}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "6px 0",
              background: "none",
              border: "1px solid #333",
              color: "#8a8aa0",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {collapsed ? "\u23FB" : "Logout"}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{
        flex: 1,
        marginLeft: collapsed ? 56 : 220,
        padding: 32,
        background: "#f8f9fa",
        minHeight: "100vh",
        transition: "margin-left 0.2s ease",
      }}>
        {children}
      </main>
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
