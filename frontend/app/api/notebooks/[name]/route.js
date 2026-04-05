import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasFeature } from "../../../../lib/features.js";
import { query } from "../../../../lib/db.js";

const JUPYTERHUB_INTERNAL = "http://jupyterhub:8000";

function userApiBase(orgShort) {
  return `${JUPYTERHUB_INTERNAL}/jupyter/user/${orgShort}`;
}

// POST /api/notebooks/[name] — pull notebook content from Jupyter back to DB
// Called when user clicks "Done" after editing in Jupyter
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const { name } = await params;
  const { page_id } = await request.json();
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  // Include user ID in filename — matches the open API naming
  const nbPath = `u${user.id}_${encodeURIComponent(name)}.ipynb`;
  const jupyterApi = userApiBase(orgShort);

  // Pull content from the org's Jupyter server
  let nbContent = null;
  try {
    // Try new path first, then legacy path for migration
    for (const tryPath of [nbPath, `org_${orgShort}/${encodeURIComponent(name)}.ipynb`]) {
      const res = await fetch(`${jupyterApi}/api/contents/${tryPath}?content=1`);
      if (res.ok) {
        const data = await res.json();
        nbContent = data.content;
        break;
      }
    }
  } catch {
    return NextResponse.json({ error: "Could not reach Jupyter" }, { status: 502 });
  }

  if (!nbContent) {
    return NextResponse.json({ error: "Notebook not found in Jupyter" }, { status: 404 });
  }

  // Save back to DB (merge into existing config)
  const pageResult = await query(
    `SELECT config FROM user_pages WHERE id = $1 AND org_id = $2`,
    [page_id, user.org_id]
  );
  if (pageResult.rows.length === 0) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const existingConfig = typeof pageResult.rows[0].config === "string"
    ? JSON.parse(pageResult.rows[0].config) : (pageResult.rows[0].config || {});

  const newConfig = { ...existingConfig, notebook_content: nbContent };

  await query(
    `UPDATE user_pages SET config = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
    [JSON.stringify(newConfig), page_id, user.org_id]
  );

  // Clean up: delete the temp file from Jupyter (DB is source of truth now)
  try {
    await fetch(`${jupyterApi}/api/contents/${nbPath}`, { method: "DELETE" });
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, cells: nbContent.cells?.length || 0 });
}
