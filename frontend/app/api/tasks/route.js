import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import { hasPermission } from "../../../lib/permissions.js";

// Compute next run from cron expression (checks next 7 days)
function cronNextRun(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  function matchField(field, val) {
    if (field === "*") return true;
    for (const part of field.split(",")) {
      if (part.includes("/")) {
        const [base, step] = part.split("/");
        const s = parseInt(step);
        const start = base === "*" ? 0 : parseInt(base);
        if ((val - start) % s === 0 && val >= start) return true;
      } else if (part.includes("-")) {
        const [lo, hi] = part.split("-");
        if (val >= parseInt(lo) && val <= parseInt(hi)) return true;
      } else {
        if (val === parseInt(part)) return true;
      }
    }
    return false;
  }

  const now = new Date();
  let candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
  for (let i = 0; i < 7 * 24 * 60; i++) {
    if (
      matchField(parts[0], candidate.getUTCMinutes()) &&
      matchField(parts[1], candidate.getUTCHours()) &&
      matchField(parts[2], candidate.getUTCDate()) &&
      matchField(parts[3], candidate.getUTCMonth() + 1) &&
      matchField(parts[4], candidate.getUTCDay())  // 0=Sun in JS
    ) {
      return candidate.toISOString();
    }
    candidate = new Date(candidate.getTime() + 60000);
  }
  return null;
}

// GET — list all scheduled tasks in org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Need tasks.view or tasks.manage permission (or super admin)
  const canView = user.is_super_admin || await hasPermission(user, "tasks.view") || await hasPermission(user, "tasks.manage");
  if (!canView) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const result = await query(
    `SELECT p.id, p.name, p.slug, p.icon, p.page_type, p.status, p.config, p.updated_at,
            u.username as owner_name, u.id as owner_id
     FROM user_pages p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.org_id = $1 AND p.entry_type = 'page' AND p.config::text LIKE '%schedule%'
     ORDER BY p.updated_at DESC`,
    [user.org_id]
  );

  const tasks = result.rows
    .map((row) => {
      const cfg = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
      if (!cfg.schedule) return null;
      // Compute next_run if not already set
      const schedule = { ...cfg.schedule };
      if (!schedule.next_run && schedule.cron) {
        schedule.next_run = cronNextRun(schedule.cron);
      }
      return {
        page_id: row.id,
        page_name: row.name,
        page_icon: row.icon,
        page_type: row.page_type,
        page_status: row.status,
        owner_name: row.owner_name,
        owner_id: row.owner_id,
        schedule,
        updated_at: row.updated_at,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ tasks });
}

// PATCH — enable/disable a task (requires tasks.manage)
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const canManage = user.is_super_admin || await hasPermission(user, "tasks.manage");
  if (!canManage) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const { page_id, enabled } = await request.json();
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

  // Get current config
  const page = await query("SELECT config FROM user_pages WHERE id = $1 AND org_id = $2", [page_id, user.org_id]);
  if (!page.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cfg = typeof page.rows[0].config === "string" ? JSON.parse(page.rows[0].config) : (page.rows[0].config || {});
  if (!cfg.schedule) return NextResponse.json({ error: "No schedule on this page" }, { status: 400 });

  cfg.schedule.enabled = enabled;
  cfg.schedule.updated_at = new Date().toISOString();

  await query("UPDATE user_pages SET config = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(cfg), page_id]);
  return NextResponse.json({ ok: true });
}

// DELETE — remove schedule from a task (requires tasks.manage)
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const canManage = user.is_super_admin || await hasPermission(user, "tasks.manage");
  if (!canManage) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const { page_id } = await request.json();
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

  const page = await query("SELECT config FROM user_pages WHERE id = $1 AND org_id = $2", [page_id, user.org_id]);
  if (!page.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cfg = typeof page.rows[0].config === "string" ? JSON.parse(page.rows[0].config) : (page.rows[0].config || {});
  delete cfg.schedule;

  await query("UPDATE user_pages SET config = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(cfg), page_id]);
  return NextResponse.json({ ok: true });
}
