import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth.js";
import { hasPermission } from "../../../../../lib/permissions.js";
import { queryDataAdvanced, insertData, updateRecord, deleteRecords, getTableById } from "../../../../../lib/org-tables.js";

// GET — query table data with server-side filter/sort/paginate
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.is_super_admin && !(await hasPermission(user, "db.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const table = await getTableById(user.org_id, id);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit")) || 50;
  const offset = parseInt(searchParams.get("offset")) || 0;
  const order_by = searchParams.get("order_by") || "created_at";
  const order_dir = searchParams.get("order_dir") || "DESC";

  // Parse filters: ?filter=column:op:value&filter=column2:op2:value2
  const filters = (searchParams.getAll("filter") || []).map((f) => {
    const [column, op, ...rest] = f.split(":");
    return { column, op: op || "eq", value: rest.join(":") };
  }).filter((f) => f.column);

  try {
    const result = await queryDataAdvanced(user.org_id, table.name, { limit, offset, order_by, order_dir, filters });
    return NextResponse.json({ ...result, table: { id: table.id, name: table.name, columns: table.columns } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// POST — insert record(s)
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.is_super_admin && !(await hasPermission(user, "db.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const table = await getTableById(user.org_id, id);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const body = await request.json();
  const rows = Array.isArray(body) ? body : body.rows || [body];

  try {
    const inserted = await insertData(user.org_id, table.name, rows);
    return NextResponse.json({ ok: true, inserted });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// PATCH — update a record
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.is_super_admin && !(await hasPermission(user, "db.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const table = await getTableById(user.org_id, id);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const { record_id, data } = await request.json();
  if (!record_id || !data) return NextResponse.json({ error: "record_id and data required" }, { status: 400 });

  try {
    await updateRecord(user.org_id, table.name, record_id, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// DELETE — delete record(s)
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.is_super_admin && !(await hasPermission(user, "db.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const table = await getTableById(user.org_id, id);
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const { record_ids } = await request.json();
  if (!record_ids || !Array.isArray(record_ids)) return NextResponse.json({ error: "record_ids array required" }, { status: 400 });

  try {
    const deleted = await deleteRecords(user.org_id, table.name, record_ids);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
