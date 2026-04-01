import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import crypto from "crypto";

// GET — list channels + tokens + connection info
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const channels = await query(
    `SELECT c.*, u.username as created_by_name FROM org_channels c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.org_id = $1 ORDER BY c.name`,
    [user.org_id]
  );

  const tokens = await query(
    `SELECT t.id, t.name, t.token_prefix, t.permissions, t.is_active, t.created_at, t.last_used_at,
            u.username as created_by_name
     FROM channel_tokens t
     LEFT JOIN users u ON t.created_by = u.id
     WHERE t.org_id = $1 ORDER BY t.created_at DESC`,
    [user.org_id]
  );

  // Org info for connection details
  const org = await query("SELECT id, slug FROM organizations WHERE id = $1", [user.org_id]);
  const orgSlug = org.rows[0]?.slug || "";
  const orgShort = user.org_id.replace(/-/g, "").slice(0, 8);

  return NextResponse.json({
    channels: channels.rows,
    tokens: tokens.rows,
    connection: {
      org_id: user.org_id,
      org_slug: orgSlug,
      org_short: orgShort,
      mqtt: {
        broker: "mqtt://localhost",
        port: 1884,
        topic_prefix: `org/${orgShort}`,
        example_topic: `org/${orgShort}/sensors/temperature`,
      },
      websocket: {
        url: `ws://localhost:8080/ws/channels`,
      },
      http: {
        publish_url: `/api/channels/publish`,
      },
    },
  });
}

// POST — create channel or token
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();

  if (body.action === "create_token") {
    const token = `cht_${crypto.randomBytes(24).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const prefix = token.slice(0, 12);

    await query(
      `INSERT INTO channel_tokens (org_id, name, token_hash, token_prefix, permissions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.org_id, body.name || "Device Token", hash, prefix, JSON.stringify(body.permissions || []), user.id]
    );
    return NextResponse.json({ token, prefix }, { status: 201 });
  }

  if (body.action === "delete_token") {
    await query("DELETE FROM channel_tokens WHERE id = $1 AND org_id = $2", [body.token_id, user.org_id]);
    return NextResponse.json({ ok: true });
  }

  // Create channel
  const { name, description, channel_type } = body;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!/^[a-zA-Z0-9._/-]+$/.test(name)) {
    return NextResponse.json({ error: "Channel name: only alphanumeric, dots, slashes, underscores" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO org_channels (org_id, name, description, channel_type, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, name) DO NOTHING RETURNING *`,
    [user.org_id, name, description || "", channel_type || "data", user.id]
  );

  if (!result.rows[0]) return NextResponse.json({ error: "Channel already exists" }, { status: 409 });
  return NextResponse.json({ channel: result.rows[0] }, { status: 201 });
}
