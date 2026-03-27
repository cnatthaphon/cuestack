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
      { href: "/-/apps", label: "Apps", icon: "\u{1F4F1}", permission: null, feature: "app_builder" },
      { href: "/-/notebooks", label: "Notebooks", icon: "\u{1F4D3}", permission: null, feature: "notebooks" },
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
      { href: "/-/settings", label: "Settings", icon: "\u2699", permission: "org.settings", feature: null },
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
  const { user, org, navData, myDashboards, loading, logout, hasPermission, refresh } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [dashExpanded, setDashExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState({});
  const pathname = usePathname();

  if (loading) {
    return <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading...</div>;
  }

  if (!user) return null;

  const filterItems = (items) => items.filter((item) => {
    if (item.permission && !user.is_super_admin && !user.permissions?.includes(item.permission)) return false;
    if (item.feature && !user.features?.includes(item.feature)) return false;
    return true;
  });

  const toggleGroup = (name) => setCollapsedGroups((g) => ({ ...g, [name]: !g[name] }));

  // Build published content nav from navData
  const navGroups = navData?.groups || [];
  const pubDashboards = (navData?.dashboards || []).filter((d) => !d.permission_id || hasPermission(d.permission_id));
  const pubApps = (navData?.apps || []).filter((a) => !a.permission_id || hasPermission(a.permission_id));

  // Group items by nav_group
  const groupedItems = {};
  for (const d of pubDashboards) {
    const g = d.nav_group || "";
    if (!groupedItems[g]) groupedItems[g] = [];
    groupedItems[g].push({ href: `/d/${d.slug}`, label: d.name, icon: "\u{1F4CA}", order: d.nav_order || 0 });
  }
  for (const a of pubApps) {
    const g = a.nav_group || "";
    if (!groupedItems[g]) groupedItems[g] = [];
    groupedItems[g].push({ href: `/a/${a.slug}`, label: a.name, icon: a.icon || "\u{1F4F1}", order: a.nav_order || 0 });
  }

  // Sort items within each group
  for (const g of Object.keys(groupedItems)) {
    groupedItems[g].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }

  // Build ordered list of groups (defined groups first, then ungrouped)
  const orderedGroups = [
    ...navGroups.map((g) => ({ name: g.name, icon: g.icon, items: groupedItems[g.name] || [] })),
  ];
  // Add ungrouped items
  const ungrouped = groupedItems[""] || [];
  const definedGroupNames = new Set(navGroups.map((g) => g.name));
  // Add items from groups not in org_nav_groups (shouldn't happen but safety)
  for (const [gName, items] of Object.entries(groupedItems)) {
    if (gName && !definedGroupNames.has(gName)) {
      orderedGroups.push({ name: gName, icon: "", items });
    }
  }

  // Legacy compat — keep appNav and dashNav for old code
  const appNav = pubApps.map((app) => ({
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

          {/* Published content — grouped by nav_group */}
          {orderedGroups.map((group) => {
            if (group.items.length === 0) return null;
            const isGroupCollapsed = collapsedGroups[group.name];
            return (
              <div key={group.name}>
                {!collapsed && (
                  <div onClick={() => toggleGroup(group.name)} style={{ ...sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>{group.icon} {group.name}</span>
                    <span style={{ fontSize: 10 }}>{isGroupCollapsed ? "\u25B6" : "\u25BC"}</span>
                  </div>
                )}
                {collapsed && <div style={{ borderTop: "1px solid #2a2a4a", margin: "4px 12px" }} />}
                {!isGroupCollapsed && group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
              </div>
            );
          })}

          {/* Ungrouped published items */}
          {ungrouped.length > 0 && (
            <div>
              {!collapsed && orderedGroups.length > 0 && <div style={sectionLabel}>Other</div>}
              {ungrouped.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
            </div>
          )}
        </div>

        {/* Dashboard Drive — top section like Google Drive */}
        <div style={{ borderTop: "1px solid #2a2a4a", padding: "4px 0" }}>
          {!collapsed && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px 2px" }}>
              <button onClick={() => setDashExpanded(!dashExpanded)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 10, padding: 0, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 8 }}>{dashExpanded ? "\u25BC" : "\u25B6"}</span> Dashboards
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={async () => {
                  const name = prompt("Folder name:");
                  if (!name) return;
                  await fetch("/api/my-dashboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, entry_type: "folder" }) });
                  refresh();
                }} style={plusBtn} title="New Folder">{"\u{1F4C1}"}</button>
                <button onClick={async () => {
                  const name = prompt("Dashboard name:");
                  if (!name) return;
                  const res = await fetch("/api/my-dashboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                  if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.dashboard.id}`; }
                }} style={plusBtn} title="New Dashboard">+</button>
              </div>
            </div>
          )}
          {dashExpanded && !collapsed && (
            <DashboardTree items={myDashboards || []} parentId={null} depth={0} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} />
          )}
          {collapsed && (
            <button onClick={async () => {
              const name = prompt("Dashboard name:");
              if (!name) return;
              const res = await fetch("/api/my-dashboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
              if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.dashboard.id}`; }
            }} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "6px 0" }} title="New Dashboard">{"\u{1F4CA}"}</button>
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
const plusBtn = { background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: "0 2px" };

// Dashboard tree — recursive folder/dashboard structure
function DashboardTree({ items, parentId, depth, pathname, expandedFolders, setExpandedFolders, refresh }) {
  const children = items.filter((i) => (i.parent_id || null) === parentId);
  if (children.length === 0 && depth === 0) {
    return <div style={{ padding: "4px 16px", fontSize: 11, color: "#444" }}>No dashboards yet</div>;
  }

  return children.map((item) => {
    const isFolder = item.entry_type === "folder";
    const isExpanded = expandedFolders[item.id];
    const active = pathname === `/my/${item.id}`;
    const pl = 16 + depth * 14;

    if (isFolder) {
      const folderChildren = items.filter((i) => i.parent_id === item.id);
      return (
        <div key={item.id}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              const dragId = e.dataTransfer.getData("dash_id");
              if (!dragId || dragId === item.id) return;
              await fetch(`/api/my-dashboards/${dragId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", parent_id: item.id }) });
              refresh();
            }}
            onClick={() => setExpandedFolders((f) => ({ ...f, [item.id]: !f[item.id] }))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: `5px 12px 5px ${pl}px`, cursor: "pointer", color: "#8a8aa0", fontSize: 13, transition: "background 0.1s" }}
          >
            <span style={{ fontSize: 8 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>
            <span style={{ fontSize: 13 }}>{item.icon || "\u{1F4C1}"}</span>
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{ fontSize: 10, color: "#555" }}>{folderChildren.length}</span>
          </div>
          {isExpanded && (
            <DashboardTree items={items} parentId={item.id} depth={depth + 1} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} />
          )}
        </div>
      );
    }

    // Dashboard item
    return (
      <Link key={item.id} href={`/my/${item.id}`}
        draggable onDragStart={(e) => e.dataTransfer.setData("dash_id", item.id)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: `5px 12px 5px ${pl}px`,
          color: active ? "#fff" : "#8a8aa0", textDecoration: "none", fontSize: 12,
          background: active ? "rgba(0,112,243,0.2)" : "transparent",
          borderLeft: active ? "3px solid #0070f3" : "3px solid transparent",
          transition: "all 0.1s", cursor: "grab",
        }}>
        <span style={{ fontSize: 12 }}>{item.icon || "\u{1F4CA}"}</span>
        <span>{item.name}</span>
        {item.visibility !== "private" && <span style={{ fontSize: 9, color: "#555" }}>{item.visibility === "org" ? "\u{1F465}" : "\u{1F310}"}</span>}
      </Link>
    );
  });
}
