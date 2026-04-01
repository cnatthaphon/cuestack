import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, hashPassword, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission, getDefaultRoleId } from "../../../lib/permissions.js";

// List users (with roles from user_roles table)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await hasPermission(user, "users.view")) && !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgFilter = isSuperAdmin(user) ? "" : "WHERE u.org_id = $1";
  const params = isSuperAdmin(user) ? [] : [user.org_id];

  const result = await query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.display_name,
            u.email, u.phone, u.department, u.role_id, u.org_id,
            u.is_super_admin, u.created_at
     FROM users u ${orgFilter} ORDER BY u.id`,
    params
  );

  // Fetch roles for each user from user_roles
  const users = [];
  for (const row of result.rows) {
    const rolesRes = await query(
      `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1
       UNION
       SELECT r.id, r.name FROM roles r WHERE r.id = $1 AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $2)`,
      [row.role_id || 0, row.id]
    );
    // Get roles from user_roles, fallback to legacy role_id
    let roles;
    const multiRoles = await query("SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1", [row.id]);
    if (multiRoles.rows.length > 0) {
      roles = multiRoles.rows;
    } else if (row.role_id) {
      const legacy = await query("SELECT id, name FROM roles WHERE id = $1", [row.role_id]);
      roles = legacy.rows;
    } else {
      roles = [];
    }

    users.push({
      ...row,
      roles,
      role_names: roles.map((r) => r.name).join(", "),
    });
  }

  return NextResponse.json({ users });
}

// Create user (with multiple roles)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "users.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, role_ids, role_id, first_name, last_name, email, phone, department, org_id } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const targetOrgId = isSuperAdmin(user) ? (org_id || null) : user.org_id;

  // Support both role_ids (array) and legacy role_id (single)
  let roleIdList = role_ids || [];
  if (roleIdList.length === 0 && role_id) roleIdList = [role_id];
  if (roleIdList.length === 0 && targetOrgId) {
    const defaultId = await getDefaultRoleId(targetOrgId, "Viewer");
    if (defaultId) roleIdList = [defaultId];
  }

  try {
    const hash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, hashed_password, role_id, org_id, first_name, last_name, email, phone, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, org_id`,
      [username, hash, roleIdList[0] || null, targetOrgId, first_name || null, last_name || null, email || null, phone || null, department || null]
    );

    const newUser = result.rows[0];

    // Insert into user_roles
    for (const rid of roleIdList) {
      await query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [newUser.id, rid]);
    }

    return NextResponse.json({ user: { ...newUser, role_ids: roleIdList } }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Username already exists in this organization" }, { status: 409 });
    }
    throw err;
  }
}
