"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "../../lib/user-context.js";
import TopBar from "../../lib/components/top-bar.js";

// System pages — grouped by category
const NAV_SECTIONS = [
  {
    label: "Data",
    items: [
      { href: "/-/databases", label: "Databases", icon: "\u{1F4BE}", permission: "db.view", feature: "databases" },
      { href: "/-/files", label: "Files", icon: "\u{1F4C1}", permission: "files.view", feature: null },
      { href: "/-/channels", label: "Channels", icon: "\u{1F4E1}", permission: "db.view", feature: null },
      { href: "/-/api-keys", label: "API Keys", icon: "\u{1F510}", permission: "org.settings", feature: "api" },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/-/tasks", label: "Tasks", icon: "\u23F0", permission: "tasks.view", feature: null },
      { href: "/-/services", label: "Services", icon: "\u2699", permission: "services.manage", feature: "python_services" },
      { href: "/-/notebooks", label: "Notebooks", icon: "\u{1F4D3}", permission: "notebooks.use", feature: "notebooks" },
    ],
  },
  {
    label: "Admin",
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
  const { user, org, myPages, sharedPages, pins, loading, logout, hasPermission, hasFeature, refresh } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dashExpanded, setDashExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [autoExpanded, setAutoExpanded] = useState(false);
  const pathname = usePathname();
  const canCreate = hasPermission("pages.create");

  // Auto-expand folder containing the current page on first load
  if (!autoExpanded && myPages && myPages.length > 0 && pathname.startsWith("/my/")) {
    const pageId = pathname.split("/my/")[1];
    const page = myPages.find((p) => p.id === pageId);
    if (page && page.parent_id) {
      const toExpand = {};
      let current = page.parent_id;
      while (current) {
        toExpand[current] = true;
        const parent = myPages.find((p) => p.id === current);
        current = parent?.parent_id || null;
      }
      if (Object.keys(toExpand).length > 0) setExpandedFolders((f) => ({ ...f, ...toExpand }));
    }
    setAutoExpanded(true);
  }

  if (loading) return <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "#999", fontFamily: "system-ui" }}>Loading...</div>;
  if (!user) return null;

  const filterItems = (items) => items.filter((item) => {
    if (item.permission && !user.is_super_admin && !user.permissions?.includes(item.permission)) return false;
    if (item.feature && !user.features?.includes(item.feature)) return false;
    return true;
  });

  const onDragOverItem = (targetId) => setDragOverTarget(targetId);
  const onDragLeaveItem = () => setDragOverTarget(null);

  const navWidth = collapsed ? 52 : 240;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Left Nav — fixed, full height */}
      <nav style={{
        width: navWidth, background: "#0f172a", color: "#e2e8f0",
        display: "flex", flexDirection: "column",
        transition: "width 0.2s ease", flexShrink: 0,
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10,
        overflowX: "hidden",
      }}>
        {/* Brand */}
        <div style={{ padding: collapsed ? "14px 8px" : "14px 16px", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
            {!collapsed && (
              <Link href="/" style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", textDecoration: "none", letterSpacing: -0.3 }}>
                IoT Stack
              </Link>
            )}
            <button onClick={() => setCollapsed(!collapsed)}
              style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
              title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? "\u25B6" : "\u25C0"}
            </button>
          </div>
          {!collapsed && org && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{org.name}</div>
          )}
        </div>

        {/* Scrollable nav content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

          {/* Pinned items */}
          {!collapsed && (pins?.org?.length > 0 || pins?.personal?.length > 0) && (
            <div style={{ padding: "6px 0 4px", borderBottom: "1px solid #1e293b" }}>
              {pins?.org?.map((p) => <PinnedItem key={`o-${p.id}`} page={p} pathname={pathname} isOrg />)}
              {pins?.personal?.map((p) => <PinnedItem key={`p-${p.id}`} page={p} pathname={pathname} />)}
            </div>
          )}

          {/* Workspace */}
          <div style={{ borderBottom: "1px solid #1e293b" }}>
            {!collapsed && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 4px" }}>
                <button onClick={() => setDashExpanded(!dashExpanded)}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 10, padding: 0, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 7 }}>{dashExpanded ? "\u25BC" : "\u25B6"}</span> Workspace
                </button>
                {canCreate && (
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={async () => {
                      const name = prompt("Folder name:");
                      if (!name) return;
                      await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, entry_type: "folder" }) });
                      refresh();
                    }} style={iconBtn} title="New Folder">{"\u{1F4C1}"}</button>
                    <select onChange={async (e) => {
                      const pt = e.target.value; e.target.value = "";
                      if (!pt) return;
                      const labels = { dashboard: "Dashboard", html: "Web Page", visual: "Visual Flow", notebook: "Notebook" };
                      const name = prompt(`New ${labels[pt]} name:`);
                      if (!name) return;
                      const res = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, page_type: pt }) });
                      if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.page.id}`; }
                    }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, padding: 0 }} title="New Page">
                      <option value="">+</option>
                      <option value="dashboard">{"\u{1F4CA}"} Dashboard</option>
                      {hasFeature("app_builder") && <option value="html">{"\u{1F310}"} Web Page</option>}
                      {hasFeature("app_builder") && <option value="visual">{"\u{1F9E9}"} Visual Flow</option>}
                      {hasFeature("notebooks") && hasPermission("notebooks.use") && <option value="notebook">{"\u{1F4D3}"} Notebook</option>}
                    </select>
                  </div>
                )}
              </div>
            )}
            {dashExpanded && !collapsed && (
              <div style={{ maxHeight: 280, overflowY: "auto", paddingBottom: 4 }}>
                <PageTree items={myPages || []} parentId={null} depth={0} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} dragOverTarget={dragOverTarget} onDragOverItem={onDragOverItem} onDragLeaveItem={onDragLeaveItem} />
              </div>
            )}
            {collapsed && canCreate && (
              <button onClick={async () => {
                const name = prompt("Dashboard name:");
                if (!name) return;
                const res = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                if (res.ok) { const d = await res.json(); refresh(); window.location.href = `/my/${d.page.id}`; }
              }} style={{ display: "block", width: "100%", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: "8px 0" }} title="New">{"\u{1F4CA}"}</button>
            )}
          </div>

          {/* Shared with me */}
          {!collapsed && (sharedPages || []).length > 0 && (
            <div style={{ borderBottom: "1px solid #1e293b" }}>
              <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Shared</div>
              {sharedPages.map((p) => {
                const icons = { dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };
                const active = pathname === `/my/${p.id}`;
                return (
                  <Link key={p.id} href={`/my/${p.id}`} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 14px",
                    color: active ? "#f1f5f9" : "#94a3b8", textDecoration: "none", fontSize: 12,
                    background: active ? "rgba(59,130,246,0.15)" : "transparent",
                    borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
                  }}>
                    <span style={{ fontSize: 11 }}>{p.icon || icons[p.page_type] || "\u{1F4CA}"}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: "#475569" }}>{p.owner_name}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* System nav sections */}
          {NAV_SECTIONS.map((section, si) => {
            const items = filterItems(section.items);
            if (items.length === 0) return null;
            return (
              <div key={si}>
                {!collapsed && (
                  <div style={{ padding: "10px 14px 3px", fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
                    {section.label}
                  </div>
                )}
                {collapsed && <div style={{ borderTop: "1px solid #1e293b", margin: "4px 10px" }} />}
                {items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: collapsed ? "10px 6px" : "10px 14px", borderTop: "1px solid #1e293b", flexShrink: 0 }}>
          {!collapsed && org && (
            <div style={{ fontSize: 10, color: "#475569", textAlign: "center" }}>
              {org.plan} plan
            </div>
          )}
        </div>
      </nav>

      {/* Main content area */}
      <div style={{
        flex: 1, marginLeft: navWidth, display: "flex", flexDirection: "column",
        minHeight: "100vh", transition: "margin-left 0.2s ease",
      }}>
        {/* Top bar */}
        <header style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "6px 20px", background: "#fff", borderBottom: "1px solid #e2e8f0",
          flexShrink: 0, height: 44,
        }}>
          <TopBar />
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "24px 28px", background: "#f8fafc" }}>
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
      display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "7px 0" : "6px 14px",
      color: active ? "#f1f5f9" : "#94a3b8",
      background: active ? "rgba(59,130,246,0.15)" : "transparent",
      borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
      textDecoration: "none", fontSize: 13, fontWeight: active ? 500 : 400,
      transition: "all 0.1s", whiteSpace: "nowrap", justifyContent: collapsed ? "center" : "flex-start",
    }}>
      <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

const iconBtn = { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, padding: "0 2px" };

function hasPageSchedule(item) { return item.has_schedule === true; }

function PinnedItem({ page, pathname, isOrg }) {
  const active = pathname === `/my/${page.id}`;
  const icons = { dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };
  return (
    <Link href={`/my/${page.id}`} style={{
      display: "flex", alignItems: "center", gap: 8, padding: "4px 14px",
      color: active ? "#f1f5f9" : "#94a3b8", textDecoration: "none", fontSize: 12,
      background: active ? "rgba(59,130,246,0.15)" : "transparent",
      borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
    }}>
      <span style={{ fontSize: 10, color: isOrg ? "#f59e0b" : "#fbbf24" }}>{isOrg ? "\u{1F4CC}" : "\u2B50"}</span>
      <span style={{ fontSize: 11 }}>{page.icon || icons[page.page_type] || "\u{1F4CA}"}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.name}</span>
    </Link>
  );
}

// Page tree — recursive folder/page structure with drag indicators
function PageTree({ items, parentId, depth, pathname, expandedFolders, setExpandedFolders, refresh, dragOverTarget, onDragOverItem, onDragLeaveItem }) {
  const children = items.filter((i) => (i.parent_id || null) === parentId);
  if (children.length === 0 && depth === 0) {
    return <div style={{ padding: "8px 14px", fontSize: 11, color: "#475569" }}>No pages yet</div>;
  }

  const PAGE_ICONS = { dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };

  return children.map((item) => {
    const isFolder = item.entry_type === "folder";
    const isExpanded = expandedFolders[item.id];
    const active = pathname === `/my/${item.id}`;
    const pl = 14 + depth * 14;
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
              display: "flex", alignItems: "center", gap: 6, padding: `4px 10px 4px ${pl}px`,
              cursor: "pointer", color: "#94a3b8", fontSize: 12,
              background: isDragOver ? "rgba(59,130,246,0.1)" : "transparent",
              borderTop: isDragOver ? "2px solid #3b82f6" : "2px solid transparent",
              transition: "background 0.1s",
            }}
          >
            <span style={{ fontSize: 7 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>
            <span style={{ fontSize: 12 }}>{item.icon || "\u{1F4C1}"}</span>
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{ fontSize: 9, color: "#475569" }}>{folderChildren.length}</span>
          </div>
          {isExpanded && (
            <PageTree items={items} parentId={item.id} depth={depth + 1} pathname={pathname} expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders} refresh={refresh} dragOverTarget={dragOverTarget} onDragOverItem={onDragOverItem} onDragLeaveItem={onDragLeaveItem} />
          )}
        </div>
      );
    }

    return (
      <Link key={item.id} href={`/my/${item.id}`}
        draggable onDragStart={(e) => e.dataTransfer.setData("page_id", item.id)}
        onDragOver={(e) => { e.preventDefault(); onDragOverItem?.(item.id); }}
        onDragLeave={() => onDragLeaveItem?.()}
        style={{
          display: "flex", alignItems: "center", gap: 7, padding: `4px 10px 4px ${pl}px`,
          color: active ? "#f1f5f9" : "#94a3b8", textDecoration: "none", fontSize: 12,
          background: active ? "rgba(59,130,246,0.15)" : isDragOver ? "rgba(59,130,246,0.08)" : "transparent",
          borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
          borderTop: isDragOver ? "2px solid #3b82f6" : "2px solid transparent",
          transition: "all 0.1s", cursor: "pointer",
        }}>
        <span style={{ fontSize: 11 }}>{item.icon || PAGE_ICONS[item.page_type] || "\u{1F4CA}"}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
        {item.visibility !== "private" && <span style={{ fontSize: 8, color: "#475569" }}>{item.visibility === "org" ? "\u{1F465}" : "\u{1F310}"}</span>}
        {hasPageSchedule(item) && <span style={{ fontSize: 8 }} title="Scheduled">{"\u23F0"}</span>}
      </Link>
    );
  });
}
