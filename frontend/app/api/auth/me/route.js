import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get org info if user belongs to one
  let org = null;
  if (user.org_id) {
    const result = await query(
      "SELECT id, name, slug, plan FROM organizations WHERE id = $1",
      [user.org_id]
    );
    org = result.rows[0] || null;
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      org_id: user.org_id,
      is_super_admin: user.is_super_admin,
    },
    org,
  });
}
