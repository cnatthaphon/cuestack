import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import { hasPermission } from "../../../lib/permissions.js";

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
      return {
        page_id: row.id,
        page_name: row.name,
        page_icon: row.icon,
        page_type: row.page_type,
        page_status: row.status,
        owner_name: row.owner_name,
        owner_id: row.owner_id,
        schedule: cfg.schedule,
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
