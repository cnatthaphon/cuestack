import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission, deleteAppPermission } from "../../../../lib/permissions.js";
import { query } from "../../../../lib/db.js";

// Update app permission
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "permissions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { label, description, category } = await request.json();

  // Can only edit app permissions belonging to this org (not system)
  const perm = await query(
    "SELECT type, org_id FROM permissions WHERE id = $1",
    [id]
  );
  if (!perm.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (perm.rows[0].type === "system" && !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Cannot edit system permissions" }, { status: 403 });
  }
  if (perm.rows[0].type === "app" && perm.rows[0].org_id !== user.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates = [];
  const values = [];
  let idx = 1;
  if (label !== undefined) { updates.push(`label = $${idx++}`); values.push(label); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
  if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }

  if (updates.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  values.push(id);
  await query(`UPDATE permissions SET ${updates.join(", ")} WHERE id = $${idx}`, values);
  return NextResponse.json({ ok: true });
}

// Delete app permission
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "permissions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (isSuperAdmin(user)) {
    // Super admin can delete any app permission
    await query("DELETE FROM permissions WHERE id = $1 AND type = 'app'", [id]);
  } else {
    const deleted = await deleteAppPermission(user.org_id, id);
    if (!deleted) return NextResponse.json({ error: "Not found or system permission" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
