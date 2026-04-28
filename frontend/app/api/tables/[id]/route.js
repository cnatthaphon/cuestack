import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { dropOrgTable } from "../../../../lib/org-tables.js";
import { query } from "../../../../lib/db.js";

// Delete table
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "db.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await dropOrgTable(user.org_id, id);
  if (!deleted) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Update table description
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "db.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { description } = await request.json();

  const result = await query(
    "UPDATE org_tables SET description = $1 WHERE id = $2 AND org_id = $3",
    [description, id, user.org_id]
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
