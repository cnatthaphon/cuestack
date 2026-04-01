import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list service pages (user_pages with is_service flag)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const result = await query(`
    SELECT p.id, p.name, p.icon, p.page_type, p.config, p.slug, p.updated_at,
           u.username
    FROM user_pages p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.org_id = $1
      AND p.config->>'is_service' = 'true'
      AND p.page_type IN ('python', 'visual')
    ORDER BY p.updated_at DESC
  `, [user.org_id]);

  return NextResponse.json({ services: result.rows });
}
