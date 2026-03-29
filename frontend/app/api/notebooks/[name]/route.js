import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasFeature } from "../../../../lib/features.js";

const JUPYTER_INTERNAL = "http://jupyter:8888";

// GET /api/notebooks/[name] — fetch notebook content from Jupyter for preview
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "notebooks");
  if (!enabled) return NextResponse.json({ error: "Notebooks not enabled" }, { status: 403 });

  const { name } = await params;
  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);
  const nbPath = `org_${orgShort}/${encodeURIComponent(name)}.ipynb`;

  try {
    const res = await fetch(`${JUPYTER_INTERNAL}/jupyter/api/contents/${nbPath}?content=1`);
    if (!res.ok) {
      return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json({ notebook: data.content });
  } catch {
    return NextResponse.json({ error: "Could not reach Jupyter" }, { status: 502 });
  }
}
