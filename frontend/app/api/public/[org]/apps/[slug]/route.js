import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db.js";
import { downloadFile, getEntryByPath } from "../../../../../../lib/org-files.js";

// GET — public app by org slug + app slug
export async function GET(request, { params }) {
  const { org, slug } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const orgId = orgRes.rows[0].id;

  const appRes = await query(
    "SELECT * FROM org_apps WHERE org_id = $1 AND slug = $2 AND status = 'published'",
    [orgId, slug]
  );
  if (!appRes.rows[0]) return NextResponse.json({ error: "App not found" }, { status: 404 });

  const app = appRes.rows[0];
  let html = "";

  // For HTML apps, try to load the entrypoint from files
  if (app.app_type === "html") {
    try {
      // Look for the app's files in the org file entries
      const entry = await getEntryByPath(orgId, `/apps/${app.slug}/${app.entrypoint || "index.html"}`);
      if (entry) {
        const { buffer } = await downloadFile(orgId, entry.id);
        html = buffer.toString("utf-8");
      }
    } catch {}

    if (!html) {
      html = `<!DOCTYPE html><html><body><h1>${app.icon} ${app.name}</h1><p>${app.description || ""}</p></body></html>`;
    }
  }

  return NextResponse.json({ app, html });
}
