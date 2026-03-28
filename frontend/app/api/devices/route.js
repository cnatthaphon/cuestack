import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";

// GET — list devices for the org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Mark stale devices as offline (no heartbeat in 60s)
  await query(`
    UPDATE org_devices SET status = 'offline'
    WHERE org_id = $1 AND status = 'online'
    AND last_seen_at < NOW() - INTERVAL '60 seconds'
  `, [user.org_id]);

  const devices = await query(`
    SELECT d.*, t.name as token_name
    FROM org_devices d
    LEFT JOIN channel_tokens t ON d.token_id::uuid = t.id
    WHERE d.org_id = $1
    ORDER BY d.last_seen_at DESC NULLS LAST
  `, [user.org_id]);

  return NextResponse.json({ devices: devices.rows });
}

// POST — register or update a device
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();

  if (body.action === "delete") {
    await query("DELETE FROM org_devices WHERE id = $1 AND org_id = $2", [body.device_id, user.org_id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename") {
    await query("UPDATE org_devices SET name = $1 WHERE id = $2 AND org_id = $3",
      [body.name, body.device_id, user.org_id]);
    return NextResponse.json({ ok: true });
  }

  // Register a new device manually
  const { device_id, name, device_type } = body;
  if (!device_id) return NextResponse.json({ error: "device_id required" }, { status: 400 });

  const result = await query(`
    INSERT INTO org_devices (org_id, device_id, name, device_type)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (org_id, device_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING *
  `, [user.org_id, device_id, name || device_id, device_type || "sensor"]);

  return NextResponse.json({ device: result.rows[0] }, { status: 201 });
}
