import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, hashPassword, isSuperAdmin, isOrgAdmin } from "../../../lib/auth.js";

// List users — org admin sees their org, super admin sees all
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isSuperAdmin(user)) {
    // Super admin: optional org_id filter
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("org_id");
    if (orgId) {
      const result = await query(
        "SELECT id, username, role, org_id, is_super_admin, created_at FROM users WHERE org_id = $1 ORDER BY id",
        [orgId]
      );
      return NextResponse.json({ users: result.rows });
    }
    const result = await query(
      "SELECT id, username, role, org_id, is_super_admin, created_at FROM users ORDER BY id"
    );
    return NextResponse.json({ users: result.rows });
  }

  if (isOrgAdmin(user)) {
    // Org admin: only their org (ASVS V4.2.1 — no cross-org access)
    const result = await query(
      "SELECT id, username, role, created_at FROM users WHERE org_id = $1 ORDER BY id",
      [user.org_id]
    );
    return NextResponse.json({ users: result.rows });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Create user — org admin creates within their org, super admin can specify org
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !isOrgAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, role, org_id } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const validRoles = ["admin", "editor", "viewer"];
  const userRole = validRoles.includes(role) ? role : "viewer";

  // Determine target org
  let targetOrgId;
  if (isSuperAdmin(user)) {
    targetOrgId = org_id || null; // Super admin can create users in any org
  } else {
    targetOrgId = user.org_id; // Org admin: always their own org
  }

  try {
    const hash = await hashPassword(password);
    const result = await query(
      "INSERT INTO users (username, hashed_password, role, org_id) VALUES ($1, $2, $3, $4) RETURNING id, username, role, org_id",
      [username, hash, userRole, targetOrgId]
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Username already exists in this organization" }, { status: 409 });
    }
    throw err;
  }
}
