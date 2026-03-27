"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "../../lib/user-context.js";
import TopBar from "../../lib/components/top-bar.js";

// Nav sections — system pages under /-/ prefix
// Workspace (personal pages) rendered separately as tree at top
const NAV_SECTIONS = [
  {
    label: "Data",
    items: [
      { href: "/-/databases", label: "Databases", icon: "\u{1F4BE}", permission: "db.view", feature: "databases" },
      { href: "/-/files", label: "Files", icon: "\u{1F4C1}", permission: "files.view", feature: null },
      { href: "/-/api-keys", label: "API Keys", icon: "\u{1F510}", permission: "org.settings", feature: "api" },
      { href: "/-/services", label: "Services", icon: "\u2699", permission: null, feature: "python_services" },
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
  const { user, org, myPages, sharedPages, loading, logout, hasPermission, refresh } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null);
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

  // Drag indicator for workspace tree
  const onDragOverItem = (targetId) => setDragOverTarget(targetId);
  const onDragLeaveItem = () => setDragOverTarget(null);

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

        {/* Nav Content */}
        <div style={{ flex: 1, padding: "4px 0", overflowY: "auto" }}>

          {/* Dashboard Drive — top of nav like Google Drive */}
          <div style={{ padding: "2px 0", borderBottom: "1px solid #2a2a4a" }}>
            {!collapsed && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px 2px" }}>
                <button onClick={() => setDashExpanded(!dashExpanded)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 10, padding: 0, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 8 }}>{dashExpanded ? "\u25BC" : "\u25B6"}</span> Workspace
                </button>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={async () => {
                    const name = prompt("Folder name:");
                    if (!name) return;
                    await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, entry_type: "folder" }) });
                    refresh();
                  }} style={plusBtn} title="New Folder">{"\u{1F4C1}"}</button>
                  <select onChange={async (e) => {
                    const pt = e.target.value; e.target.value = "";
                    if (!pt) return;
                    const labels = { dashboard: "Dashboard", html: "Web Page", visual: "Visual Flow", notebook: "Notebook" };
                    const name = prompt(`New ${labels[pt]} name:`);
                    if (!name) return;
                    const res = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, page_type: pt }) });
                    if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.page.id}`; }
                  }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 11 }} title="New Page">
                    <option value="">+</option>
                    <option value="dashboard">{"\u{1F4CA}"} Dashboard</option>
                    <option value="html">{"\u{1F310}"} Web Page</option>
                    <option value="visual">{"\u{1F9E9}"} Visual Flow</option>
                    <option value="notebook">{"\u{1F4D3}"} Notebook</option>
                  </select>
                </div>
              </div>
            )}
            {dashExpanded && !collapsed && (
              <PageTree items={myPages || []} parentId={null} depth={0} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} dragOverTarget={dragOverTarget} onDragOverItem={onDragOverItem} onDragLeaveItem={onDragLeaveItem} />
            )}
            {collapsed && (
              <button onClick={async () => {
                const name = prompt("Dashboard name:");
                if (!name) return;
                const res = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.dashboard.id}`; }
              }} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14, padding: "6px 0" }} title="New Dashboard">{"\u{1F4CA}"}</button>
            )}
          </div>

          {/* Shared with me */}
          {!collapsed && (sharedPages || []).length > 0 && (
            <div style={{ padding: "2px 0", borderBottom: "1px solid #2a2a4a" }}>
              <div style={{ padding: "6px 16px 2px", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>
                Shared with me
              </div>
              {sharedPages.map((p) => {
                const icons = { dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };
                const active = pathname === `/my/${p.id}`;
                return (
                  <Link key={p.id} href={`/my/${p.id}`} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 16px",
                    color: active ? "#fff" : "#8a8aa0", textDecoration: "none", fontSize: 12,
                    background: active ? "rgba(0,112,243,0.2)" : "transparent",
                    borderLeft: active ? "3px solid #0070f3" : "3px solid transparent",
                  }}>
                    <span style={{ fontSize: 12 }}>{p.icon || icons[p.page_type] || "\u{1F4CA}"}</span>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: "#555" }}>{p.owner_name}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Nav Sections */}
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

// Page tree — recursive folder/page structure with drag indicators
function PageTree({ items, parentId, depth, pathname, expandedFolders, setExpandedFolders, refresh, dragOverTarget, onDragOverItem, onDragLeaveItem }) {
  const children = items.filter((i) => (i.parent_id || null) === parentId);
  if (children.length === 0 && depth === 0) {
    return <div style={{ padding: "6px 16px", fontSize: 11, color: "#555" }}>Click + to create a page</div>;
  }

  const PAGE_ICONS = { dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };

  return children.map((item) => {
    const isFolder = item.entry_type === "folder";
    const isExpanded = expandedFolders[item.id];
    const active = pathname === `/my/${item.id}`;
    const pl = 16 + depth * 14;
    const isDragOver = dragOverTarget === item.id;

    if (isFolder) {
      const folderChildren = items.filter((i) => i.parent_id === item.id);
      return (
        <div key={item.id}>
          <div
            onDragOver={(e) => { e.preventDefault(); onDragOverItem?.(item.id); }}
            onDragLeave={() => onDragLeaveItem?.()}
            onDrop={async (e) => {
              e.preventDefault(); onDragLeaveItem?.();
              const dragId = e.dataTransfer.getData("page_id");
              if (!dragId || dragId === item.id) return;
              await fetch(`/api/pages/${dragId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", parent_id: item.id }) });
              refresh();
            }}
            onClick={() => setExpandedFolders((f) => ({ ...f, [item.id]: !f[item.id] }))}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: `5px 12px 5px ${pl}px`,
              cursor: "pointer", color: "#8a8aa0", fontSize: 13,
              background: isDragOver ? "rgba(0,112,243,0.15)" : "transparent",
              borderTop: isDragOver ? "2px solid #0070f3" : "2px solid transparent",
              transition: "background 0.1s",
            }}
          >
            <span style={{ fontSize: 8 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>
            <span style={{ fontSize: 13 }}>{item.icon || "\u{1F4C1}"}</span>
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{ fontSize: 10, color: "#555" }}>{folderChildren.length}</span>
          </div>
          {isExpanded && (
            <PageTree items={items} parentId={item.id} depth={depth + 1} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} dragOverTarget={dragOverTarget} onDragOverItem={onDragOverItem} onDragLeaveItem={onDragLeaveItem} />
          )}
        </div>
      );
    }

    // Page item
    return (
      <Link key={item.id} href={`/my/${item.id}`}
        draggable onDragStart={(e) => e.dataTransfer.setData("page_id", item.id)}
        onDragOver={(e) => { e.preventDefault(); onDragOverItem?.(item.id); }}
        onDragLeave={() => onDragLeaveItem?.()}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: `5px 12px 5px ${pl}px`,
          color: active ? "#fff" : "#8a8aa0", textDecoration: "none", fontSize: 12,
          background: active ? "rgba(0,112,243,0.2)" : isDragOver ? "rgba(0,112,243,0.1)" : "transparent",
          borderLeft: active ? "3px solid #0070f3" : "3px solid transparent",
          borderTop: isDragOver ? "2px solid #0070f3" : "2px solid transparent",
          transition: "all 0.1s", cursor: "pointer",
        }}>
        <span style={{ fontSize: 12 }}>{item.icon || PAGE_ICONS[item.page_type] || "\u{1F4CA}"}</span>
        <span style={{ flex: 1 }}>{item.name}</span>
        {item.visibility !== "private" && <span style={{ fontSize: 9, color: "#555" }}>{item.visibility === "org" ? "\u{1F465}" : "\u{1F310}"}</span>}
      </Link>
    );
  });
}
