import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";

// GET — public personal dashboard
export async function GET(request, { params }) {
  const { org, id } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const dash = await query(
    "SELECT * FROM user_dashboards WHERE id = $1 AND org_id = $2 AND visibility = 'public' AND entry_type = 'dashboard'",
    [id, orgRes.rows[0].id]
  );
  if (!dash.rows[0]) return NextResponse.json({ error: "Dashboard not found or not public" }, { status: 404 });

  return NextResponse.json({ dashboard: dash.rows[0] });
}
