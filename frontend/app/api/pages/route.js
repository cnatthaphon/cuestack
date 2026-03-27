import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list pages (tree for nav, or by view)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "my";

  if (view === "shared") {
    const roleIds = await getRoleIds(user.id);
    const conditions = ["p.visibility = 'org'"];
    const params = [user.org_id, user.id];
    let i = 3;
    conditions.push(`p.shared_with @> $${i}::jsonb`);
    params.push(JSON.stringify([{ type: "user", id: user.id }]));
    i++;
    for (const rid of roleIds) {
      conditions.push(`p.shared_with @> $${i}::jsonb`);
      params.push(JSON.stringify([{ type: "role", id: rid }]));
      i++;
    }
    const result = await query(
      `SELECT p.*, u.username as owner_name FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.org_id = $1 AND p.user_id != $2 AND p.entry_type = 'page' AND (${conditions.join(" OR ")})
       ORDER BY p.updated_at DESC`,
      params
    );
    return NextResponse.json({ pages: result.rows });
  }

  if (view === "public") {
    const result = await query(
      `SELECT p.*, u.username as owner_name FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.org_id = $1 AND p.visibility = 'public' AND p.entry_type = 'page'
       ORDER BY p.name`,
      [user.org_id]
    );
    return NextResponse.json({ pages: result.rows });
  }

  // My pages — full tree
  const result = await query(
    "SELECT id, name, slug, icon, page_type, entry_type, parent_id, status, visibility, sort_order, permission_id FROM user_pages WHERE org_id = $1 AND user_id = $2 ORDER BY entry_type DESC, sort_order, name",
    [user.org_id, user.id]
  );
  return NextResponse.json({ pages: result.rows });
}

// POST — create page or folder
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { name, icon, parent_id, entry_type, page_type, slug } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const type = entry_type === "folder" ? "folder" : "page";
  const pType = ["dashboard", "html", "visual", "notebook"].includes(page_type) ? page_type : "dashboard";
  const defaultIcons = { folder: "\u{1F4C1}", dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}" };

  // Generate slug for pages
  const pageSlug = slug || name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Default config based on type
  const defaultConfig = { dashboard: { widgets: [], layout: { columns: 2 } }, html: {}, visual: { blocks: [] }, notebook: {} };

  const result = await query(
    `INSERT INTO user_pages (org_id, user_id, name, slug, icon, page_type, entry_type, parent_id, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [user.org_id, user.id, name, type === "folder" ? null : pageSlug,
     icon || defaultIcons[type === "folder" ? "folder" : pType],
     pType, type, parent_id || null, JSON.stringify(defaultConfig[pType] || {})]
  );
  return NextResponse.json({ page: result.rows[0] }, { status: 201 });
}

async function getRoleIds(userId) {
  const res = await query("SELECT role_id FROM user_roles WHERE user_id = $1", [userId]);
  if (res.rows.length > 0) return res.rows.map((r) => r.role_id);
  const legacy = await query("SELECT role_id FROM users WHERE id = $1", [userId]);
  return legacy.rows[0]?.role_id ? [legacy.rows[0].role_id] : [];
}
