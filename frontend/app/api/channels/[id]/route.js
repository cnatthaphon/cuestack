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

// DELETE — delete channel
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  await query("DELETE FROM org_channels WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  return NextResponse.json({ ok: true });
}
