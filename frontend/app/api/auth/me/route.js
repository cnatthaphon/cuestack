import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { getUserPermissions } from "../../../../lib/permissions.js";
import { getOrgFeatures } from "../../../../lib/features.js";
import { query } from "../../../../lib/db.js";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let org = null;
  let features = [];
  if (user.org_id) {
    const result = await query(
      "SELECT id, name, slug, plan FROM organizations WHERE id = $1",
      [user.org_id]
    );
    org = result.rows[0] || null;

    // Get enabled features for navigation
    const allFeatures = await getOrgFeatures(user.org_id);
    features = allFeatures.filter((f) => f.enabled).map((f) => f.id);
  }

  const permissions = await getUserPermissions(user.role_id);

  // Fetch profile fields
  const profileRes = await query(
    "SELECT display_name, email, phone FROM users WHERE id = $1",
    [user.id]
  );
  const profile = profileRes.rows[0] || {};

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: profile.display_name || null,
      email: profile.email || null,
      role_id: user.role_id,
      role_name: user.role_name || null,
      org_id: user.org_id,
      is_super_admin: user.is_super_admin,
      permissions,
      features,
    },
    org,
  });
}
