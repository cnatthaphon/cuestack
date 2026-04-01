import { NextResponse } from "next/server";
import { authenticateApiKey } from "../../../../lib/api-key-auth.js";
import { listOrgTables } from "../../../../lib/org-tables.js";

// List tables accessible by this API key
export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tables = await listOrgTables(auth.org_id);
  return NextResponse.json({
    tables: tables.map((t) => ({
      name: t.name,
      db_type: t.db_type,
      columns: t.columns,
      row_count: t.row_count,
    })),
  });
}
