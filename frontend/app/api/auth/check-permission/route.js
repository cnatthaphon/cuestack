import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasPermission, getUserPermissions } from "../../../../lib/permissions.js";

// GET — check if current user has a specific permission
// ?permission=db.create → { allowed: true/false }
// ?all=true → returns all user permissions
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  // Return all permissions
  if (searchParams.get("all") === "true") {
    const permissions = await getUserPermissions(user.id, user.role_id);
    return NextResponse.json({ permissions, user_id: user.id });
  }

  // Check specific permission
  const permission = searchParams.get("permission");
  if (!permission) return NextResponse.json({ error: "permission param required" }, { status: 400 });

  const allowed = await hasPermission(user, permission);
  return NextResponse.json({ permission, allowed });
}

// POST — check multiple permissions at once
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { permissions } = await request.json();
  if (!Array.isArray(permissions)) return NextResponse.json({ error: "permissions array required" }, { status: 400 });

  const allPerms = await getUserPermissions(user.id, user.role_id);
  const results = {};
  for (const p of permissions) {
    results[p] = user.is_super_admin || allPerms.includes(p);
  }

  return NextResponse.json({ results });
}
