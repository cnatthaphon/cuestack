import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import crypto from "crypto";

// GET — list channels
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await query(
    `SELECT c.*, u.username as created_by_name FROM org_channels c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.org_id = $1 ORDER BY c.name`,
    [user.org_id]
  );
  return NextResponse.json({ channels: result.rows });
}

// POST — create channel or token
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();

  if (body.action === "create_token") {
    // Generate channel token
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

  // Create channel
  const { name, description, channel_type } = body;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Validate name (alphanumeric, dots, slashes, underscores)
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
