import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

// GET /api/tasks/[page_id] — get execution logs for a task
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 200);

  // Check task_logs table exists
  try {
    const result = await query(
      `SELECT id, page_id, status, message, duration_ms, error, created_at
       FROM task_logs
       WHERE page_id = $1 AND org_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [id, user.org_id, limit]
    );
    return NextResponse.json({ logs: result.rows });
  } catch (e) {
    // Table might not exist yet
    if (e.message.includes("does not exist")) {
      return NextResponse.json({ logs: [] });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
