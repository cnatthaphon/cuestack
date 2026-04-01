import { NextResponse } from "next/server";
import { authenticateApiKey } from "../../../../lib/api-key-auth.js";
import { query } from "../../../../lib/db.js";

// POST — send notification via API key (for services/automation)
// Body: { user_id?, title, message, type, source, link }
// If no user_id, sends to all users in the org
export async function POST(request) {
  const auth = await authenticateApiKey(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { user_id, title, message, type, source, link } = await request.json();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const validTypes = ["info", "success", "warning", "error"];
  const notifType = validTypes.includes(type) ? type : "info";

  if (user_id) {
    // Send to specific user (verify same org)
    const target = await query("SELECT id FROM users WHERE id = $1 AND org_id = $2", [user_id, auth.org_id]);
    if (!target.rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await query(
      `INSERT INTO notifications (org_id, user_id, title, message, type, source, link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [auth.org_id, user_id, title, message || "", notifType, source || "api", link || ""]
    );
    return NextResponse.json({ ok: true, sent_to: 1 }, { status: 201 });
  }

  // Broadcast to all org users
  const users = await query("SELECT id FROM users WHERE org_id = $1", [auth.org_id]);
  for (const u of users.rows) {
    await query(
      `INSERT INTO notifications (org_id, user_id, title, message, type, source, link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [auth.org_id, u.id, title, message || "", notifType, source || "api", link || ""]
    );
  }

  return NextResponse.json({ ok: true, sent_to: users.rows.length }, { status: 201 });
}
