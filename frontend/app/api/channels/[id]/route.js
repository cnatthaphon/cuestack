import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

// GET — channel details + tokens
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const channel = await query("SELECT * FROM org_channels WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  if (!channel.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tokens = await query(
    "SELECT id, name, token_prefix, permissions, is_active, created_at, last_used_at FROM channel_tokens WHERE org_id = $1",
    [user.org_id]
  );

  return NextResponse.json({ channel: channel.rows[0], tokens: tokens.rows });
}

// PATCH — update channel (enable/disable, rename)
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const updates = [];
  const values = [id, user.org_id];
  let i = 3;

  if (body.is_active !== undefined) { updates.push(`is_active = $${i}`); values.push(body.is_active); i++; }
  if (body.name) { updates.push(`name = $${i}`); values.push(body.name); i++; }
  if (body.description !== undefined) { updates.push(`description = $${i}`); values.push(body.description); i++; }

  if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await query(`UPDATE org_channels SET ${updates.join(", ")} WHERE id = $1 AND org_id = $2`, values);
  return NextResponse.json({ ok: true });
}

// DELETE — delete channel
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  await query("DELETE FROM org_channels WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  return NextResponse.json({ ok: true });
}
