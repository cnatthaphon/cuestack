import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";

// GET — public dashboard by org slug + page slug
export async function GET(request, { params }) {
  const { org, slug } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const orgId = orgRes.rows[0].id;

  // Find published dashboard page with this slug
  const pageRes = await query(
    "SELECT * FROM user_pages WHERE org_id = $1 AND slug = $2 AND status = 'published' AND page_type = 'dashboard' AND entry_type = 'page'",
    [orgId, slug]
  );
  if (!pageRes.rows[0]) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

  return NextResponse.json({ dashboard: pageRes.rows[0] });
}
