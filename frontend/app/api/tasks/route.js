import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list all scheduled tasks in org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Find all pages that have a schedule in their config
  const result = await query(
    `SELECT p.id, p.name, p.slug, p.icon, p.page_type, p.status, p.config, p.updated_at,
            u.username as owner_name, u.id as owner_id
     FROM user_pages p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.org_id = $1 AND p.entry_type = 'page' AND p.config::text LIKE '%schedule%'
     ORDER BY p.updated_at DESC`,
    [user.org_id]
  );

  const tasks = result.rows
    .map((row) => {
      const cfg = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
      if (!cfg.schedule) return null;
      return {
        page_id: row.id,
        page_name: row.name,
        page_icon: row.icon,
        page_type: row.page_type,
        page_status: row.status,
        owner_name: row.owner_name,
        owner_id: row.owner_id,
        schedule: cfg.schedule,
        updated_at: row.updated_at,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ tasks });
}
