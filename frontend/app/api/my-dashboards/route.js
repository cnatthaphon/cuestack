import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list dashboards (tree structure with folders)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "my";
  const parentId = searchParams.get("parent") || null;

  if (view === "shared") {
    const roleIds = await getRoleIds(user.id);
    const conditions = [`d.visibility = 'org'`];
    const params = [user.org_id, user.id];
    let i = 3;
    conditions.push(`d.shared_with @> $${i}::jsonb`);
    params.push(JSON.stringify([{ type: "user", id: user.id }]));
    i++;
    for (const rid of roleIds) {
      conditions.push(`d.shared_with @> $${i}::jsonb`);
      params.push(JSON.stringify([{ type: "role", id: rid }]));
      i++;
    }
    const result = await query(
      `SELECT d.*, u.username as owner_name FROM user_dashboards d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.org_id = $1 AND d.user_id != $2 AND d.entry_type = 'dashboard' AND (${conditions.join(" OR ")})
       ORDER BY d.updated_at DESC`,
      params
    );
    return NextResponse.json({ dashboards: result.rows });
  }

  // My dashboards — tree structure
  const result = await query(
    `SELECT * FROM user_dashboards WHERE org_id = $1 AND user_id = $2 AND ${parentId ? "parent_id = $3" : "parent_id IS NULL"}
     ORDER BY entry_type DESC, sort_order, name`,
    parentId ? [user.org_id, user.id, parentId] : [user.org_id, user.id]
  );

  // Also build full tree for nav (flat list)
  const allResult = await query(
    "SELECT id, name, icon, parent_id, entry_type, visibility, sort_order FROM user_dashboards WHERE org_id = $1 AND user_id = $2 ORDER BY entry_type DESC, sort_order, name",
    [user.org_id, user.id]
  );

  return NextResponse.json({
    dashboards: result.rows,
    tree: allResult.rows,
  });
}

// POST — create dashboard or folder
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { name, icon, parent_id, entry_type } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const type = entry_type === "folder" ? "folder" : "dashboard";

  const result = await query(
    `INSERT INTO user_dashboards (org_id, user_id, name, icon, parent_id, entry_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [user.org_id, user.id, name, icon || (type === "folder" ? "\u{1F4C1}" : "\u{1F4CA}"), parent_id || null, type]
  );
  return NextResponse.json({ dashboard: result.rows[0] }, { status: 201 });
}

async function getRoleIds(userId) {
  const res = await query("SELECT role_id FROM user_roles WHERE user_id = $1", [userId]);
  if (res.rows.length > 0) return res.rows.map((r) => r.role_id);
  const legacy = await query("SELECT role_id FROM users WHERE id = $1", [userId]);
  return legacy.rows[0]?.role_id ? [legacy.rows[0].role_id] : [];
}
