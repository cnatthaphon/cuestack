import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { getUserPermissions, getUserRoleNames } from "../../../../lib/permissions.js";
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

    const allFeatures = await getOrgFeatures(user.org_id);
    features = allFeatures.filter((f) => f.enabled).map((f) => f.id);
  }

  // Multi-role: union permissions across all roles
  const permissions = await getUserPermissions(user.id, user.role_id);
  const roles = await getUserRoleNames(user.id, user.role_id);

  // Profile fields
  const profileRes = await query(
    "SELECT display_name, first_name, last_name, email, phone, department FROM users WHERE id = $1",
    [user.id]
  );
  const profile = profileRes.rows[0] || {};

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
      email: profile.email || null,
      department: profile.department || null,
      role_id: user.role_id, // legacy single role
      role_name: roles.map((r) => r.name).join(", ") || null,
      roles, // [{id, name}, ...]
      org_id: user.org_id,
      is_super_admin: user.is_super_admin,
      permissions,
      features,
    },
    org,
  });
}
