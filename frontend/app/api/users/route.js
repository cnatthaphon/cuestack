import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, hashPassword, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission, getDefaultRoleId } from "../../../lib/permissions.js";

// List users
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isSuperAdmin(user)) {
    const result = await query(
      `SELECT u.id, u.username, u.role_id, u.org_id, u.is_super_admin, u.created_at,
              r.name as role_name
       FROM users u LEFT JOIN roles r ON u.role_id = r.id ORDER BY u.id`
    );
    return NextResponse.json({ users: result.rows });
  }

  if (!(await hasPermission(user, "users.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `SELECT u.id, u.username, u.role_id, u.created_at, r.name as role_name
     FROM users u LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.org_id = $1 ORDER BY u.id`,
    [user.org_id]
  );
  return NextResponse.json({ users: result.rows });
}

// Create user
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, role_id, org_id } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Determine target org and role
  let targetOrgId, targetRoleId;
  if (isSuperAdmin(user)) {
    targetOrgId = org_id || null;
    targetRoleId = role_id || (targetOrgId ? await getDefaultRoleId(targetOrgId, "Viewer") : null);
  } else {
    targetOrgId = user.org_id;
    targetRoleId = role_id || await getDefaultRoleId(user.org_id, "Viewer");
  }

  try {
    const hash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, hashed_password, role_id, org_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role_id, org_id`,
      [username, hash, targetRoleId, targetOrgId]
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Username already exists in this organization" }, { status: 409 });
    }
    throw err;
  }
}
