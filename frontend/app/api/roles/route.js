import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";

// List roles in org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "roles.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = user.org_id;
  const result = await query(
    `SELECT r.*,
            (SELECT COUNT(*) FROM users WHERE role_id = r.id) as user_count,
            ARRAY(SELECT permission_id FROM role_permissions WHERE role_id = r.id) as permissions
     FROM roles r WHERE r.org_id = $1 ORDER BY r.id`,
    [orgId]
  );

  return NextResponse.json({ roles: result.rows });
}

// Create custom role
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "roles.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, permissions } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "Role name required" }, { status: 400 });
  }

  const orgId = user.org_id;

  try {
    const result = await query(
      "INSERT INTO roles (org_id, name, description) VALUES ($1, $2, $3) RETURNING id",
      [orgId, name, description || ""]
    );
    const roleId = result.rows[0].id;

    // Assign permissions
    if (Array.isArray(permissions)) {
      for (const permId of permissions) {
        await query(
          "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [roleId, permId]
        );
      }
    }

    return NextResponse.json({ role: { id: roleId, name, permissions } }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Role name already exists" }, { status: 409 });
    }
    throw err;
  }
}
