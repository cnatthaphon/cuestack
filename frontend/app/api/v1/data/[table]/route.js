import { NextResponse } from "next/server";
import { authenticateApiKey, keyHasAccess } from "../../../../../lib/api-key-auth.js";
import { insertData, queryData } from "../../../../../lib/org-tables.js";

// Insert data
export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { table } = await params;

  if (!keyHasAccess(auth.permissions, table, "write")) {
    return NextResponse.json({ error: "API key does not have write access to this table" }, { status: 403 });
  }

  const body = await request.json();
  const rows = Array.isArray(body) ? body : body.rows || [body];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: "Maximum 1000 rows per request" }, { status: 400 });
  }

  try {
    const inserted = await insertData(auth.org_id, table, rows);
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

// Query data
export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { table } = await params;

  if (!keyHasAccess(auth.permissions, table, "read")) {
    return NextResponse.json({ error: "API key does not have read access to this table" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const data = await queryData(auth.org_id, table, {
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
      order_by: searchParams.get("order_by"),
      order_dir: searchParams.get("order_dir"),
    });
    return NextResponse.json({ data, count: data.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
