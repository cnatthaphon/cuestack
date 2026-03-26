import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { getCurrentUser, hashPassword, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";

// GET — user detail
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // IDOR check
  if (!isSuperAdmin(user)) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  const result = await query(
    `SELECT id, username, first_name, last_name, display_name, email, phone, department,
            role_id, org_id, is_super_admin, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const userDetail = result.rows[0];

  // Get roles from user_roles
  const rolesRes = await query("SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1", [id]);
  let roles = rolesRes.rows;
  if (roles.length === 0 && userDetail.role_id) {
    const legacy = await query("SELECT id, name FROM roles WHERE id = $1", [userDetail.role_id]);
    roles = legacy.rows;
  }

  return NextResponse.json({ user: { ...userDetail, roles } });
}

// PATCH — update user profile + roles
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (!isSuperAdmin(user)) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  const body = await request.json();
  const updates = [];
  const values = [id];
  let i = 2;

  // Profile fields
  for (const field of ["first_name", "last_name", "display_name", "email", "phone", "department"]) {
    if (body[field] !== undefined) { updates.push(`${field} = $${i}`); values.push(body[field]); i++; }
  }

  // Password
  if (body.password) {
    if (body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 chars" }, { status: 400 });
    const hash = await hashPassword(body.password);
    updates.push(`hashed_password = $${i}`); values.push(hash); i++;
  }

  // Legacy single role_id
  if (body.role_id) { updates.push(`role_id = $${i}`); values.push(body.role_id); i++; }

  if (updates.length > 0) {
    updates.push("updated_at = NOW()");
    await query(`UPDATE users SET ${updates.join(", ")} WHERE id = $1`, values);
  }

  // Multi-role: replace user_roles
  if (body.role_ids && Array.isArray(body.role_ids)) {
    await query("DELETE FROM user_roles WHERE user_id = $1", [id]);
    for (const rid of body.role_ids) {
      await query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, rid]);
    }
    // Keep legacy role_id in sync (first role)
    if (body.role_ids.length > 0) {
      await query("UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2", [body.role_ids[0], id]);
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (String(user.id) === String(id)) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

  if (!isSuperAdmin(user)) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  await query("DELETE FROM user_roles WHERE user_id = $1", [id]);
  await query("DELETE FROM users WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
