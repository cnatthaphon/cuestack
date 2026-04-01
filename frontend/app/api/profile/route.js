import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword, verifyPassword } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — get own profile
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await query(
    "SELECT id, username, first_name, last_name, display_name, email, phone, department, avatar_url, role_id, org_id, is_super_admin, created_at FROM users WHERE id = $1",
    [user.id]
  );
  return NextResponse.json({ profile: result.rows[0] || null });
}

// PATCH — update own profile (name, email, phone, password)
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const updates = [];
  const values = [user.id];
  let i = 2;

  // Allowed self-edit fields
  if (body.first_name !== undefined) { updates.push(`first_name = $${i}`); values.push(body.first_name); i++; }
  if (body.last_name !== undefined) { updates.push(`last_name = $${i}`); values.push(body.last_name); i++; }
  if (body.display_name !== undefined) { updates.push(`display_name = $${i}`); values.push(body.display_name); i++; }
  if (body.department !== undefined) { updates.push(`department = $${i}`); values.push(body.department); i++; }
  if (body.landing_page !== undefined) { updates.push(`landing_page = $${i}`); values.push(body.landing_page); i++; }
  if (body.email !== undefined) {
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    updates.push(`email = $${i}`); values.push(body.email); i++;
  }
  if (body.phone !== undefined) {
    if (body.phone && body.phone.length > 30) {
      return NextResponse.json({ error: "Phone too long" }, { status: 400 });
    }
    updates.push(`phone = $${i}`); values.push(body.phone); i++;
  }

  // Password change — requires current_password
  if (body.new_password) {
    if (!body.current_password) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }
    if (body.new_password.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }
    // Verify current password
    const userRow = await query("SELECT hashed_password FROM users WHERE id = $1", [user.id]);
    const valid = await verifyPassword(body.current_password, userRow.rows[0].hashed_password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    const hashed = await hashPassword(body.new_password);
    updates.push(`hashed_password = $${i}`); values.push(hashed); i++;
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = NOW()");
  await query(`UPDATE users SET ${updates.join(", ")} WHERE id = $1`, values);

  return NextResponse.json({ ok: true });
}
