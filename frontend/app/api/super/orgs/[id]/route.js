import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db.js";
import { requireSuperAdmin } from "../../../../../lib/super-auth.js";

// Update org
export async function PATCH(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json();

  const updates = [];
  const values = [];
  let idx = 1;

  const { name, plan, storage_limit_mb, is_active, license_expires_at, max_users, max_devices } = body;

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
  if (plan !== undefined) { updates.push(`plan = $${idx++}`); values.push(plan); }
  if (storage_limit_mb !== undefined) { updates.push(`storage_limit_mb = $${idx++}`); values.push(storage_limit_mb); }
  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
  if (license_expires_at !== undefined) { updates.push(`license_expires_at = $${idx++}`); values.push(license_expires_at || null); }
  if (max_users !== undefined) { updates.push(`max_users = $${idx++}`); values.push(max_users); }
  if (max_devices !== undefined) { updates.push(`max_devices = $${idx++}`); values.push(max_devices); }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  await query(
    `UPDATE organizations SET ${updates.join(", ")} WHERE id = $${idx}`,
    values
  );
  return NextResponse.json({ ok: true });
}

// Delete org (cascades users)
export async function DELETE(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const result = await query("DELETE FROM organizations WHERE id = $1 RETURNING name", [id]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: result.rows[0].name });
}
