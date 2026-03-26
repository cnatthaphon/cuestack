import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list nav groups + their items (apps + dashboards)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  // Get groups
  const groups = await query(
    "SELECT * FROM org_nav_groups WHERE org_id = $1 ORDER BY sort_order, name",
    [user.org_id]
  );

  // Get published dashboards
  const dashboards = await query(
    "SELECT id, name, slug, permission_id, nav_group, nav_order FROM org_dashboards WHERE org_id = $1 AND status = 'published' ORDER BY nav_order, name",
    [user.org_id]
  );

  // Get published apps
  const apps = await query(
    "SELECT id, name, slug, icon, permission_id, app_type, nav_group, nav_order FROM org_apps WHERE org_id = $1 AND status = 'published' ORDER BY nav_order, name",
    [user.org_id]
  );

  return NextResponse.json({
    groups: groups.rows,
    dashboards: dashboards.rows,
    apps: apps.rows,
  });
}

// POST — create/update/delete nav group, or assign item to group
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const body = await request.json();

  if (body.action === "create_group") {
    if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const result = await query(
      "INSERT INTO org_nav_groups (org_id, name, icon, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, name) DO UPDATE SET icon = $3, sort_order = $4 RETURNING *",
      [user.org_id, body.name, body.icon || "", body.sort_order || 0]
    );
    return NextResponse.json({ group: result.rows[0] }, { status: 201 });
  }

  if (body.action === "delete_group") {
    if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    // Unassign items from this group
    await query("UPDATE org_dashboards SET nav_group = '' WHERE org_id = $1 AND nav_group = $2", [user.org_id, body.name]);
    await query("UPDATE org_apps SET nav_group = '' WHERE org_id = $1 AND nav_group = $2", [user.org_id, body.name]);
    await query("DELETE FROM org_nav_groups WHERE org_id = $1 AND name = $2", [user.org_id, body.name]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "assign") {
    const { item_type, item_id, group, order } = body;
    if (!item_type || !item_id) return NextResponse.json({ error: "item_type and item_id required" }, { status: 400 });
    const table = item_type === "dashboard" ? "org_dashboards" : "org_apps";
    await query(`UPDATE ${table} SET nav_group = $1, nav_order = $2 WHERE id = $3 AND org_id = $4`,
      [group || "", order || 0, item_id, user.org_id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reorder_groups") {
    // body.order: [{ name, sort_order }]
    for (const g of (body.order || [])) {
      await query("UPDATE org_nav_groups SET sort_order = $1 WHERE org_id = $2 AND name = $3",
        [g.sort_order, user.org_id, g.name]);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reorder_items") {
    // body.items: [{ id, type, nav_group, nav_order }]
    for (const item of (body.items || [])) {
      const table = item.type === "dashboard" ? "org_dashboards" : "org_apps";
      await query(`UPDATE ${table} SET nav_group = $1, nav_order = $2 WHERE id = $3 AND org_id = $4`,
        [item.nav_group || "", item.nav_order || 0, item.id, user.org_id]);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename_group") {
    if (!body.old_name || !body.new_name) return NextResponse.json({ error: "old_name and new_name required" }, { status: 400 });
    await query("UPDATE org_nav_groups SET name = $1, icon = COALESCE($2, icon) WHERE org_id = $3 AND name = $4",
      [body.new_name, body.icon, user.org_id, body.old_name]);
    await query("UPDATE org_apps SET nav_group = $1 WHERE org_id = $2 AND nav_group = $3",
      [body.new_name, user.org_id, body.old_name]);
    await query("UPDATE org_dashboards SET nav_group = $1 WHERE org_id = $2 AND nav_group = $3",
      [body.new_name, user.org_id, body.old_name]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
