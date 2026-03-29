"use client";

import { useEffect, useState, useMemo } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { Badge, DateCell } from "../../../../lib/components/data-table.js";

const TABS = [
  { id: "logs", label: "Access Logs", icon: "\u{1F4DC}" },
  { id: "failed", label: "Failed Logins", icon: "\u26A0\uFE0F" },
  { id: "overview", label: "Security Overview", icon: "\u{1F6E1}\uFE0F" },
];

export default function SecurityPage() {
  const { user, hasPermission } = useUser();
  const [tab, setTab] = useState("logs");
  const [logs, setLogs] = useState([]);
  const [failed, setFailed] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const isAdmin = user?.is_super_admin || hasPermission("org.settings");

  useEffect(() => {
    if (!user) return;
    loadTab(tab);
  }, [tab, user]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/security?tab=${t}&limit=200`);
      if (!res.ok) return;
      const data = await res.json();
      if (t === "logs") setLogs(data.logs || []);
      else if (t === "failed") setFailed(data.failed || []);
      else if (t === "overview") setOverview(data.overview || null);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // Determine which tabs to show (overview only for admin/super admin)
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "overview");

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ margin: "0 0 16px" }}>Security & Audit</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {visibleTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === t.id ? "#0070f3" : "transparent", color: tab === t.id ? "#fff" : "#666",
            borderRadius: "6px 6px 0 0",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {loading && <div style={{ color: "#999", fontSize: 13, padding: 20 }}>Loading...</div>}

      {!loading && tab === "logs" && <AccessLogsTab logs={logs} filterAction={filterAction} setFilterAction={setFilterAction} filterUser={filterUser} setFilterUser={setFilterUser} filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom} filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo} />}
      {!loading && tab === "failed" && <FailedLoginsTab failed={failed} />}
      {!loading && tab === "overview" && isAdmin && <OverviewTab overview={overview} isSuperAdmin={user?.is_super_admin} />}
    </div>
  );
}

// ---- Tab 1: Access Logs ----

function AccessLogsTab({ logs, filterAction, setFilterAction, filterUser, setFilterUser, filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo }) {
  // Unique actions and users for filter dropdowns
  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);
  const users = useMemo(() => [...new Set(logs.map((l) => l.username).filter(Boolean))].sort(), [logs]);

  const filtered = useMemo(() => {
    let result = logs;
    if (filterAction) result = result.filter((l) => l.action === filterAction);
    if (filterUser) result = result.filter((l) => l.username === filterUser);
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter((l) => new Date(l.created_at) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo + "T23:59:59");
      result = result.filter((l) => new Date(l.created_at) <= to);
    }
    return result;
  }, [logs, filterAction, filterUser, filterDateFrom, filterDateTo]);

  const columns = [
    { key: "created_at", label: "Timestamp", render: (v) => <DateCell value={v} />, width: 160 },
    { key: "username", label: "User", render: (v) => v || <span style={{ color: "#ccc" }}>{"\u2014"}</span> },
    { key: "action", label: "Action", render: (v) => <Badge color={actionColor(v)} bg={actionBg(v)}>{v}</Badge> },
    { key: "resource_type", label: "Resource Type" },
    { key: "resource_id", label: "Resource ID", render: (v) => v ? <code style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{v}</code> : <span style={{ color: "#ccc" }}>{"\u2014"}</span> },
    { key: "ip_address", label: "IP Address", render: (v) => <code style={{ fontSize: 11 }}>{v || "unknown"}</code> },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          Action:
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          User:
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={selectStyle}>
            <option value="">All</option>
            {users.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          From:
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>
          To:
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={inputStyle} />
        </label>
        {(filterAction || filterUser || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterAction(""); setFilterUser(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            style={{ fontSize: 12, color: "#e53e3e", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchKeys={["username", "action", "resource_type", "resource_id", "ip_address"]}
        pageSize={20}
        emptyMessage="No audit log entries"
      />
    </div>
  );
}

// ---- Tab 2: Failed Logins ----

function FailedLoginsTab({ failed }) {
  // Count IPs to detect brute force
  const ipCounts = useMemo(() => {
    const counts = {};
    for (const entry of failed) {
      const ip = entry.ip_address || "unknown";
      counts[ip] = (counts[ip] || 0) + 1;
    }
    return counts;
  }, [failed]);

  // IPs with >= 10 attempts are considered blocked
  const blockedIPs = useMemo(() => new Set(
    Object.entries(ipCounts).filter(([, count]) => count >= 10).map(([ip]) => ip)
  ), [ipCounts]);

  // IPs with >= 5 attempts are suspicious
  const suspiciousIPs = useMemo(() => new Set(
    Object.entries(ipCounts).filter(([, count]) => count >= 5 && count < 10).map(([ip]) => ip)
  ), [ipCounts]);

  const columns = [
    { key: "created_at", label: "Timestamp", render: (v) => <DateCell value={v} />, width: 160 },
    { key: "ip_address", label: "IP Address", render: (v) => {
      const ip = v || "unknown";
      const isBlocked = blockedIPs.has(ip);
      const isSuspicious = suspiciousIPs.has(ip);
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <code style={{ fontSize: 11 }}>{ip}</code>
          {isBlocked && <Badge color="#fff" bg="#e53e3e">BLOCKED</Badge>}
          {isSuspicious && <Badge color="#92400e" bg="#fef3c7">Repeated</Badge>}
        </span>
      );
    }},
    { key: "resource_id", label: "Username Attempted", render: (v) => v || <span style={{ color: "#ccc" }}>{"\u2014"}</span> },
    { key: "details", label: "Details", render: (v) => {
      if (!v) return <span style={{ color: "#ccc" }}>{"\u2014"}</span>;
      const d = typeof v === "string" ? tryParse(v) : v;
      return <span style={{ fontSize: 11, color: "#666" }}>{d?.username ? `User: ${d.username}` : JSON.stringify(d)}</span>;
    }},
    { key: "ip_address", label: "Attempts from IP", render: (v) => {
      const count = ipCounts[v || "unknown"] || 0;
      const color = count >= 10 ? "#e53e3e" : count >= 5 ? "#d97706" : "#666";
      return <strong style={{ color }}>{count}</strong>;
    }},
  ];

  return (
    <div>
      {/* Summary banner */}
      {blockedIPs.size > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
          <strong>{blockedIPs.size} IP{blockedIPs.size > 1 ? "s" : ""} blocked</strong> (10+ failed attempts in 15 min window): {[...blockedIPs].join(", ")}
        </div>
      )}

      <DataTable
        columns={columns}
        data={failed}
        searchKeys={["ip_address", "resource_id"]}
        pageSize={20}
        idKey="id"
        emptyMessage="No failed login attempts"
      />
    </div>
  );
}

// ---- Tab 3: Security Overview (admin only) ----

function OverviewTab({ overview, isSuperAdmin }) {
  if (!overview) return <div style={{ color: "#999", fontSize: 13 }}>No data available</div>;

  const cards = [
    { label: "Logins Today", value: overview.logins_today ?? 0, icon: "\u{1F511}", color: "#0070f3" },
    { label: "Failed Attempts Today", value: overview.failed_today ?? 0, icon: "\u26A0\uFE0F", color: overview.failed_today > 20 ? "#e53e3e" : "#d97706" },
    { label: "Unique IPs Today", value: overview.unique_ips_today ?? 0, icon: "\u{1F310}", color: "#7c3aed" },
    { label: "Active Sessions (24h)", value: overview.active_sessions ?? 0, icon: "\u{1F465}", color: "#059669" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {isSuperAdmin && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16, fontSize: 13 }}>
          <strong>System-wide stats</strong> (super admin)
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div>Total audit entries: <strong>{overview.total_entries ?? 0}</strong></div>
            <div>Failed logins (all time): <strong>{overview.total_failed ?? 0}</strong></div>
            <div>Unique IPs (all time): <strong>{overview.total_unique_ips ?? 0}</strong></div>
            <div>Blocked IPs (current): <strong>{overview.blocked_ips ?? 0}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function actionColor(action) {
  if (action === "login_failed") return "#e53e3e";
  if (action === "login") return "#059669";
  if (action?.startsWith("delete")) return "#e53e3e";
  if (action?.startsWith("create")) return "#0070f3";
  if (action?.startsWith("update")) return "#d97706";
  return "#333";
}

function actionBg(action) {
  if (action === "login_failed") return "#fef2f2";
  if (action === "login") return "#f0fdf4";
  if (action?.startsWith("delete")) return "#fef2f2";
  if (action?.startsWith("create")) return "#e8f4ff";
  if (action?.startsWith("update")) return "#fffbeb";
  return "#f1f5f9";
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

const selectStyle = {
  padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 4,
  fontSize: 12, background: "#fff", cursor: "pointer",
};

const inputStyle = {
  padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 4,
  fontSize: 12, background: "#fff",
};
