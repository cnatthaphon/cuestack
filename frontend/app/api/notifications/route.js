import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list notifications for current user
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 100);

  let sql = "SELECT * FROM notifications WHERE user_id = $1";
  const params = [user.id];
  if (unreadOnly) { sql += " AND is_read = false"; }
  sql += " ORDER BY created_at DESC LIMIT $2";
  params.push(limit);

  const result = await query(sql, params);

  // Also get unread count
  const countRes = await query("SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false", [user.id]);

  return NextResponse.json({
    notifications: result.rows,
    unread_count: parseInt(countRes.rows[0].count),
  });
}

// POST — send notification (from services/apps/system)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { user_id, title, message, type, source, link } = await request.json();

  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // Target: specific user or self
  const targetUserId = user_id || user.id;

  // If targeting another user, verify same org
  if (user_id && user_id !== user.id) {
    const target = await query("SELECT org_id FROM users WHERE id = $1", [user_id]);
    if (!target.rows[0] || target.rows[0].org_id !== user.org_id) {
      return NextResponse.json({ error: "User not found in your org" }, { status: 404 });
    }
  }

  const validTypes = ["info", "success", "warning", "error"];
  const notifType = validTypes.includes(type) ? type : "info";

  const result = await query(
    `INSERT INTO notifications (org_id, user_id, title, message, type, source, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [user.org_id, targetUserId, title, message || "", notifType, source || "", link || ""]
  );

  return NextResponse.json({ notification: result.rows[0] }, { status: 201 });
}

// PATCH — mark notifications as read
export async function PATCH(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { ids, all } = await request.json();

  if (all) {
    await query("UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false", [user.id]);
  } else if (Array.isArray(ids) && ids.length > 0) {
    await query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2::uuid[])",
      [user.id, ids]
    );
  }

  return NextResponse.json({ ok: true });
}
