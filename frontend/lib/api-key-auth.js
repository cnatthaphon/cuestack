import { query } from "./db.js";
import { hashApiKey, PLAN_RATE_LIMITS } from "./org-tables.js";

// In-memory rate limiter
const rateLimits = new Map(); // key_prefix → { count, resetAt }

/**
 * Authenticate API key from Authorization header.
 * Returns { org_id, permissions, key_id } or { error, status }.
 */
export async function authenticateApiKey(request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer isk_")) {
    return { error: "API key required (Bearer isk_...)", status: 401 };
  }

  const key = auth.slice(7); // remove "Bearer "
  const keyHash = hashApiKey(key);

  const result = await query(
    `SELECT k.id, k.org_id, k.permissions, k.rate_limit, k.key_prefix, k.expires_at,
            o.plan, o.is_active as org_active
     FROM api_keys k
     JOIN organizations o ON k.org_id = o.id
     WHERE k.key_hash = $1 AND k.is_active = true`,
    [keyHash]
  );

  if (!result.rows[0]) {
    return { error: "Invalid API key", status: 401 };
  }

  const keyData = result.rows[0];

  // Check org active
  if (!keyData.org_active) {
    return { error: "Organization is disabled", status: 403 };
  }

  // Check expiry
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: "API key expired", status: 401 };
  }

  // Rate limiting
  const rateLimit = keyData.rate_limit || PLAN_RATE_LIMITS[keyData.plan] || 100;
  if (!checkRate(keyData.key_prefix, rateLimit)) {
    return { error: `Rate limit exceeded (${rateLimit}/min)`, status: 429 };
  }

  // Update last_used_at
  await query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [keyData.id]);

  return {
    org_id: keyData.org_id,
    permissions: keyData.permissions || [],
    key_id: keyData.id,
    plan: keyData.plan,
  };
}

function checkRate(prefix, limit) {
  const now = Date.now();
  const entry = rateLimits.get(prefix);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(prefix, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * Check if API key has permission for a table + action.
 * permissions format: [{ table: "sensor_data", access: "read" }, { table: "sensor_data", access: "write" }]
 * Empty permissions = all tables, all access.
 */
export function keyHasAccess(permissions, tableName, action) {
  if (!permissions || permissions.length === 0) return true; // empty = full access
  return permissions.some(
    (p) => (p.table === "*" || p.table === tableName) && (p.access === "*" || p.access === action)
  );
}
