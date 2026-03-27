import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";

// GET — public personal page (dashboard, html app, etc.)
export async function GET(request, { params }) {
  const { org, id } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const page = await query(
    "SELECT * FROM user_pages WHERE id = $1 AND org_id = $2 AND visibility = 'public' AND entry_type = 'page'",
    [id, orgRes.rows[0].id]
  );
  if (!page.rows[0]) return NextResponse.json({ error: "Page not found or not public" }, { status: 404 });

  return NextResponse.json({ page: page.rows[0] });
}
