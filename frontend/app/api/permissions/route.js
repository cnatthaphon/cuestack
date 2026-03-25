import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission, getOrgPermissions, createAppPermission } from "../../../lib/permissions.js";

// List permissions (system + org's app permissions)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isSuperAdmin(user)) {
    // Super admin sees all system permissions
    const { query } = await import("../../../lib/db.js");
    const result = await query(
      "SELECT id, category, label, description, type, org_id FROM permissions ORDER BY type, category, id"
    );
    return NextResponse.json({ permissions: result.rows });
  }

  if (!user.org_id) return NextResponse.json({ error: "No org context" }, { status: 403 });

  const permissions = await getOrgPermissions(user.org_id);
  return NextResponse.json({ permissions });
}

// Create app permission (org-defined)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "permissions.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, category, label, description } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "Permission ID required" }, { status: 400 });
  }

  // Validate: no dots in custom ID (we add app. prefix)
  if (/[^a-z0-9_]/.test(id)) {
    return NextResponse.json({ error: "ID must be lowercase alphanumeric with underscores" }, { status: 400 });
  }

  try {
    const permId = await createAppPermission(user.org_id, { id, category, label, description });
    return NextResponse.json({ permission: { id: permId, category, label, description, type: "app" } }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Permission ID already exists" }, { status: 409 });
    }
    throw err;
  }
}
