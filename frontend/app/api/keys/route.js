import { NextResponse } from "next/server";
import { getCurrentUser, isSuperAdmin } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { generateApiKey } from "../../../lib/org-tables.js";
import { query } from "../../../lib/db.js";

// List API keys
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "org.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await query(
    `SELECT id, name, key_prefix, permissions, rate_limit, is_active, last_used_at, created_at, expires_at
     FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
    [user.org_id]
  );
  return NextResponse.json({ keys: result.rows });
}

// Create API key
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdmin(user) && !(await hasPermission(user, "org.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, permissions, rate_limit, expires_in_days } = await request.json();

  if (!name) return NextResponse.json({ error: "Key name required" }, { status: 400 });

  const { key, hash, prefix } = generateApiKey();

  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  await query(
    `INSERT INTO api_keys (org_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.org_id, name, hash, prefix, JSON.stringify(permissions || []), rate_limit || null, expiresAt]
  );

  // Return the actual key ONCE — it won't be shown again
  return NextResponse.json({
    key,  // shown only once
    name,
    prefix,
    permissions: permissions || [],
    warning: "Save this key now. It will not be shown again.",
  }, { status: 201 });
}
