import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { getCurrentUser, hashPassword, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";

// Delete user
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (String(user.id) === String(id)) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  // ASVS V4.2.1: verify target belongs to same org
  if (!isSuperAdmin(user)) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  await query("DELETE FROM users WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

// Update user role/password
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // ASVS V4.2.1: verify target belongs to same org
  if (!isSuperAdmin(user)) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  const { role_id, password } = await request.json();

  if (role_id) {
    await query("UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2", [role_id, id]);
  }

  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const hash = await hashPassword(password);
    await query("UPDATE users SET hashed_password = $1, updated_at = NOW() WHERE id = $2", [hash, id]);
  }

  return NextResponse.json({ ok: true });
}
