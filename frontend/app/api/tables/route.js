import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { listOrgTables, createOrgTable } from "../../../lib/org-tables.js";

// List org's tables
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "db.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tables = await listOrgTables(user.org_id);
  return NextResponse.json({ tables });
}

// Create table
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "db.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, db_type, columns, description } = await request.json();

  try {
    const table = await createOrgTable(user.org_id, { name, db_type, columns, description });
    return NextResponse.json({ table }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Table name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
