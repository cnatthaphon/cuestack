import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { requireSuperAdmin } from "../../../../lib/super-auth.js";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const orgs = await query("SELECT COUNT(*) as count FROM organizations");
  const users = await query("SELECT COUNT(*) as count FROM users WHERE is_super_admin = false");

  return NextResponse.json({
    organizations: parseInt(orgs.rows[0].count),
    users: parseInt(users.rows[0].count),
  });
}
