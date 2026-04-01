import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";

// GET — public app by org slug + page slug
export async function GET(request, { params }) {
  const { org, slug } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const orgId = orgRes.rows[0].id;

  // Find published page with this slug
  const pageRes = await query(
    "SELECT * FROM user_pages WHERE org_id = $1 AND slug = $2 AND status = 'published' AND entry_type = 'page'",
    [orgId, slug]
  );
  if (!pageRes.rows[0]) return NextResponse.json({ error: "App not found" }, { status: 404 });

  const page = pageRes.rows[0];
  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});

  let html = "";
  if (page.page_type === "html") {
    html = cfg.html || `<!DOCTYPE html><html><body><h1>${page.icon} ${page.name}</h1></body></html>`;
  }

  return NextResponse.json({ app: page, html });
}
