import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";
import { requireSuperAdmin } from "../../../../../../lib/super-auth.js";
import { hashPassword } from "../../../../../../lib/auth.js";

// List users in org
export async function GET(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const result = await query(
    `SELECT u.id, u.username, u.role_id, r.name as role, u.created_at
     FROM users u LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.org_id = $1 ORDER BY u.id`,
    [id]
  );
  return NextResponse.json({ users: result.rows });
}

// Create user in org
export async function POST(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { username, password, role } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Find role_id by name
  const roleName = role || "viewer";
  const roleResult = await query(
    "SELECT id FROM roles WHERE org_id = $1 AND LOWER(name) = LOWER($2)",
    [id, roleName]
  );
  const roleId = roleResult.rows[0]?.id || null;

  try {
    const hash = await hashPassword(password);
    const result = await query(
      "INSERT INTO users (username, hashed_password, role_id, org_id) VALUES ($1, $2, $3, $4) RETURNING id, username, role_id, org_id",
      [username, hash, roleId, id]
    );
    return NextResponse.json({ user: { ...result.rows[0], role: roleName } }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Username already exists in this organization" }, { status: 409 });
    }
    throw err;
  }
}
