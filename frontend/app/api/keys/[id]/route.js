import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { query } from "../../../../lib/db.js";

// Revoke API key
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "org.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await query("DELETE FROM api_keys WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  return NextResponse.json({ ok: true });
}

// Toggle API key active/inactive
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "org.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { is_active } = await request.json();

  await query(
    "UPDATE api_keys SET is_active = $1 WHERE id = $2 AND org_id = $3",
    [is_active, id, user.org_id]
  );
  return NextResponse.json({ ok: true });
}
