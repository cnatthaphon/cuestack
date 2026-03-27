import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

// GET — get dashboard
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const result = await query("SELECT * FROM user_dashboards WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!result.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dash = result.rows[0];
  // Access check: owner, org visibility, or shared
  if (dash.user_id !== user.id && dash.visibility === "private") {
    const shared = dash.shared_with || [];
    const hasAccess = shared.some((s) => s.type === "user" && s.id === user.id);
    if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({ dashboard: dash });
}

// PATCH — update dashboard (widgets, layout, name, visibility, sharing)
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const dash = await query("SELECT * FROM user_dashboards WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!dash.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (dash.rows[0].user_id !== user.id) return NextResponse.json({ error: "Only owner can edit" }, { status: 403 });

  const body = await request.json();
  const updates = ["updated_at = NOW()"];
  const values = [id, user.org_id];
  let i = 3;

  if (body.widgets !== undefined) { updates.push(`widgets = $${i}`); values.push(JSON.stringify(body.widgets)); i++; }
  if (body.layout !== undefined) { updates.push(`layout = $${i}`); values.push(JSON.stringify(body.layout)); i++; }
  if (body.name !== undefined) { updates.push(`name = $${i}`); values.push(body.name); i++; }
  if (body.icon !== undefined) { updates.push(`icon = $${i}`); values.push(body.icon); i++; }
  if (body.visibility !== undefined) { updates.push(`visibility = $${i}`); values.push(body.visibility); i++; }
  if (body.shared_with !== undefined) { updates.push(`shared_with = $${i}`); values.push(JSON.stringify(body.shared_with)); i++; }
  if (body.sort_order !== undefined) { updates.push(`sort_order = $${i}`); values.push(body.sort_order); i++; }

  await query(`UPDATE user_dashboards SET ${updates.join(", ")} WHERE id = $1 AND org_id = $2`, values);
  return NextResponse.json({ ok: true });
}

// DELETE
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const dash = await query("SELECT user_id FROM user_dashboards WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!dash.rows[0] || dash.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });

  await query("DELETE FROM user_dashboards WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

// POST — clone dashboard
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const { action } = await request.json();

  if (action === "clone") {
    const original = await query("SELECT * FROM user_dashboards WHERE id = $1 AND org_id = $2", [id, user.org_id]);
    if (!original.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const o = original.rows[0];

    const result = await query(
      `INSERT INTO user_dashboards (org_id, user_id, name, icon, widgets, layout) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user.org_id, user.id, `${o.name} (copy)`, o.icon, JSON.stringify(o.widgets), JSON.stringify(o.layout)]
    );
    return NextResponse.json({ dashboard: result.rows[0] }, { status: 201 });
  }

  if (action === "move") {
    const { parent_id } = await request.json().catch(() => ({}));
    const dash2 = await query("SELECT user_id FROM user_dashboards WHERE id = $1", [id]);
    if (!dash2.rows[0] || dash2.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });
    await query("UPDATE user_dashboards SET parent_id = $1, updated_at = NOW() WHERE id = $2", [parent_id || null, id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
