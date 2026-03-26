import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";

// GET — public dashboard by org slug + dashboard slug
export async function GET(request, { params }) {
  const { org, slug } = await params;

  // Find org
  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const orgId = orgRes.rows[0].id;

  // Find dashboard — must be published AND public visibility or is_public
  const dashRes = await query(
    "SELECT * FROM org_dashboards WHERE org_id = $1 AND slug = $2 AND status = 'published'",
    [orgId, slug]
  );
  if (!dashRes.rows[0]) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

  // TODO: check if dashboard is marked as public
  // For now, all published dashboards are accessible via public URL
  return NextResponse.json({ dashboard: dashRes.rows[0] });
}
