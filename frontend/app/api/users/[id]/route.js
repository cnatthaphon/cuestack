import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { getCurrentUser, hashPassword } from "../../../../lib/auth.js";

// Delete user (admin only, cannot delete self)
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (String(user.id) === String(id)) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await query("DELETE FROM users WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

// Update user role/password (admin only)
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { role, password } = await request.json();

  if (role) {
    const validRoles = ["admin", "editor", "viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await query("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2", [role, id]);
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
