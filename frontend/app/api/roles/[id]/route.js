import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { getCurrentUser, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";

// Update role permissions
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "roles.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, description, permissions } = await request.json();

  // Verify role belongs to user's org
  if (!isSuperAdmin(user)) {
    const role = await query("SELECT org_id FROM roles WHERE id = $1", [id]);
    if (!role.rows[0] || role.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
  }

  if (name) {
    await query("UPDATE roles SET name = $1 WHERE id = $2", [name, id]);
  }
  if (description !== undefined) {
    await query("UPDATE roles SET description = $1 WHERE id = $2", [description, id]);
  }

  // Update permissions: delete all and re-insert
  if (Array.isArray(permissions)) {
    await query("DELETE FROM role_permissions WHERE role_id = $1", [id]);
    for (const permId of permissions) {
      await query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, permId]
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// Delete role
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "roles.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Check no users assigned to this role
  const users = await query("SELECT COUNT(*) as count FROM users WHERE role_id = $1", [id]);
  if (parseInt(users.rows[0].count) > 0) {
    return NextResponse.json({ error: "Cannot delete role with assigned users. Reassign them first." }, { status: 400 });
  }

  await query("DELETE FROM roles WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
