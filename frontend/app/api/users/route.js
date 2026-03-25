import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser, hashPassword } from "../../../lib/auth.js";

// List all users (admin only)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await query(
    "SELECT id, username, role, created_at FROM users ORDER BY id"
  );
  return NextResponse.json({ users: result.rows });
}

// Create user (admin only)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { username, password, role } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  // Password policy (ASVS V2.1.1): min 8 chars
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const validRoles = ["admin", "editor", "viewer"];
  const userRole = validRoles.includes(role) ? role : "viewer";

  try {
    const hash = await hashPassword(password);
    const result = await query(
      "INSERT INTO users (username, hashed_password, role) VALUES ($1, $2, $3) RETURNING id, username, role",
      [username, hash, userRole]
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    throw err;
  }
}
