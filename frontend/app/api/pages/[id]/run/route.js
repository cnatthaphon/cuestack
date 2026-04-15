import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth.js";
import { query } from "../../../../../lib/db.js";

// POST /api/pages/[id]/run — execute Python code once via backend
export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const page = await query("SELECT user_id, page_type, org_id FROM user_pages WHERE id = $1", [id]);
  if (!page.rows[0]) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (page.rows[0].user_id !== user.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });
  if (page.rows[0].page_type !== "python") return NextResponse.json({ error: "Only Python pages can be run" }, { status: 400 });

  const { code } = await request.json();
  if (!code || !code.trim()) return NextResponse.json({ error: "No code to run" }, { status: 400 });

  // Execute via backend API
  const backendUrl = process.env.BACKEND_URL || "http://backend:8000";
  try {
    const res = await fetch(`${backendUrl}/api/run-python`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        org_id: page.rows[0].org_id,
        page_id: id,
        timeout: 30,
      }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Backend error: ${e.message}` }, { status: 500 });
  }
}
