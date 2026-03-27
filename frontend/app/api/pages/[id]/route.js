import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

// GET — get page
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const result = await query("SELECT * FROM user_pages WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!result.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const page = result.rows[0];
  // Access: owner, org, shared
  if (page.user_id !== user.id && page.visibility === "private") {
    const shared = page.shared_with || [];
    if (!shared.some((s) => s.type === "user" && s.id === user.id)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  return NextResponse.json({ page });
}

// PATCH — update page
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const page = await query("SELECT user_id FROM user_pages WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!page.rows[0] || page.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not found or not owner" }, { status: 403 });

  const body = await request.json();
  const updates = ["updated_at = NOW()"];
  const values = [id];
  let i = 2;

  for (const field of ["name", "icon", "slug", "status", "visibility", "sort_order"]) {
    if (body[field] !== undefined) { updates.push(`${field} = $${i}`); values.push(body[field]); i++; }
  }
  if (body.config !== undefined) { updates.push(`config = $${i}`); values.push(JSON.stringify(body.config)); i++; }
  if (body.shared_with !== undefined) { updates.push(`shared_with = $${i}`); values.push(JSON.stringify(body.shared_with)); i++; }
  if (body.parent_id !== undefined) { updates.push(`parent_id = $${i}`); values.push(body.parent_id || null); i++; }

  // Publish: create permission
  if (body.action === "publish") {
    const p = await query("SELECT slug FROM user_pages WHERE id = $1", [id]);
    const slug = p.rows[0]?.slug;
    if (slug) {
      const permId = `app.${slug}`;
      await query(
        `INSERT INTO permissions (id, category, label, description, type, org_id)
         VALUES ($1, 'apps', $2, $3, 'app', $4) ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
        [permId, `Access ${body.name || slug}`, `Access the ${slug} page`, user.org_id]
      );
      updates.push(`permission_id = $${i}`); values.push(permId); i++;
      updates.push(`status = $${i}`); values.push("published"); i++;
    }
  }

  await query(`UPDATE user_pages SET ${updates.join(", ")} WHERE id = $1`, values);
  return NextResponse.json({ ok: true });
}

// DELETE
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const page = await query("SELECT user_id, permission_id FROM user_pages WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!page.rows[0] || page.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });

  // Clean up permission if published
  if (page.rows[0].permission_id) {
    await query("DELETE FROM role_permissions WHERE permission_id = $1", [page.rows[0].permission_id]);
    await query("DELETE FROM permissions WHERE id = $1 AND org_id = $2", [page.rows[0].permission_id, user.org_id]);
  }

  // Delete children (folder)
  const children = await query("SELECT id FROM user_pages WHERE parent_id = $1", [id]);
  for (const child of children.rows) {
    await query("UPDATE user_pages SET parent_id = NULL WHERE id = $1", [child.id]);
  }

  await query("DELETE FROM user_pages WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

// POST — clone or move
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  if (body.action === "clone") {
    const original = await query("SELECT * FROM user_pages WHERE id = $1 AND org_id = $2", [id, user.org_id]);
    if (!original.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const o = original.rows[0];
    const result = await query(
      `INSERT INTO user_pages (org_id, user_id, name, icon, page_type, config) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user.org_id, user.id, `${o.name} (copy)`, o.icon, o.page_type, JSON.stringify(o.config)]
    );
    return NextResponse.json({ page: result.rows[0] }, { status: 201 });
  }

  if (body.action === "move") {
    const page = await query("SELECT user_id FROM user_pages WHERE id = $1", [id]);
    if (!page.rows[0] || page.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });
    await query("UPDATE user_pages SET parent_id = $1, updated_at = NOW() WHERE id = $2", [body.parent_id || null, id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
