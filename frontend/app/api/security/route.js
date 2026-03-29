import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Require at least org.settings permission (or super admin)
  if (!isSuperAdmin(user) && !(await hasPermission(user, "org.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "logs";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    if (tab === "logs") {
      return await getLogs(user, limit, offset);
    } else if (tab === "failed") {
      return await getFailedLogins(user, limit, offset);
    } else if (tab === "overview") {
      return await getOverview(user);
    }
    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  } catch (err) {
    console.error("Security API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Tab 1: Access Logs
async function getLogs(user, limit, offset) {
  const isSuper = isSuperAdmin(user);
  const orgFilter = isSuper ? "" : "WHERE a.org_id = $3";
  const params = isSuper ? [limit, offset] : [limit, offset, user.org_id];

  const result = await query(
    `SELECT a.id, a.org_id, a.user_id, a.action, a.resource_type, a.resource_id,
            a.details, a.ip_address, a.created_at,
            u.username
     FROM audit_log a
     LEFT JOIN users u ON a.user_id = u.id
     ${orgFilter}
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  return NextResponse.json({ logs: result.rows });
}

// Tab 2: Failed Logins
async function getFailedLogins(user, limit, offset) {
  const isSuper = isSuperAdmin(user);

  // For non-super admins, show only their org's failed logins
  const orgFilter = isSuper ? "" : "AND (a.org_id = $3 OR a.org_id IS NULL)";
  const params = isSuper ? [limit, offset] : [limit, offset, user.org_id];

  const result = await query(
    `SELECT a.id, a.org_id, a.user_id, a.action, a.resource_type, a.resource_id,
            a.details, a.ip_address, a.created_at
     FROM audit_log a
     WHERE a.action = 'login_failed'
     ${orgFilter}
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  return NextResponse.json({ failed: result.rows });
}

// Tab 3: Security Overview (aggregated stats)
async function getOverview(user) {
  const isSuper = isSuperAdmin(user);
  const orgCond = isSuper ? "" : "AND org_id = $1";
  const params = isSuper ? [] : [user.org_id];

  // Today's logins
  const loginsToday = await query(
    `SELECT COUNT(*) as count FROM audit_log
     WHERE action = 'login' AND created_at >= CURRENT_DATE ${orgCond}`,
    params
  );

  // Today's failed attempts
  const failedToday = await query(
    `SELECT COUNT(*) as count FROM audit_log
     WHERE action = 'login_failed' AND created_at >= CURRENT_DATE ${orgCond.replace("org_id", "org_id")}`,
    params
  );

  // Unique IPs today
  const uniqueIPs = await query(
    `SELECT COUNT(DISTINCT ip_address) as count FROM audit_log
     WHERE created_at >= CURRENT_DATE ${orgCond}`,
    params
  );

  // Active sessions (logins in last 24h)
  const activeSessions = await query(
    `SELECT COUNT(DISTINCT user_id) as count FROM audit_log
     WHERE action = 'login' AND created_at >= NOW() - INTERVAL '24 hours' ${orgCond}`,
    params
  );

  const overview = {
    logins_today: parseInt(loginsToday.rows[0]?.count || 0),
    failed_today: parseInt(failedToday.rows[0]?.count || 0),
    unique_ips_today: parseInt(uniqueIPs.rows[0]?.count || 0),
    active_sessions: parseInt(activeSessions.rows[0]?.count || 0),
  };

  // Super admin gets system-wide stats
  if (isSuper) {
    const totalEntries = await query("SELECT COUNT(*) as count FROM audit_log");
    const totalFailed = await query("SELECT COUNT(*) as count FROM audit_log WHERE action = 'login_failed'");
    const totalUniqueIPs = await query("SELECT COUNT(DISTINCT ip_address) as count FROM audit_log");
    // Currently blocked: IPs with >= 10 failed attempts in last 15 min
    const blockedIPs = await query(
      `SELECT COUNT(DISTINCT ip_address) as count FROM (
         SELECT ip_address, COUNT(*) as attempts FROM audit_log
         WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '15 minutes'
         GROUP BY ip_address HAVING COUNT(*) >= 10
       ) blocked`
    );

    overview.total_entries = parseInt(totalEntries.rows[0]?.count || 0);
    overview.total_failed = parseInt(totalFailed.rows[0]?.count || 0);
    overview.total_unique_ips = parseInt(totalUniqueIPs.rows[0]?.count || 0);
    overview.blocked_ips = parseInt(blockedIPs.rows[0]?.count || 0);
  }

  return NextResponse.json({ overview });
}
