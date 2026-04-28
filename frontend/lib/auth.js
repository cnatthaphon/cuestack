import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query } from "./db.js";

// SECRET_KEY checked at runtime, not module load (build-time has no env vars)
function getSecret() {
  const key = process.env.SECRET_KEY;
  if (!key && process.env.NODE_ENV === "production" && typeof window === "undefined") {
    console.error("WARNING: SECRET_KEY not set in production — using insecure default");
  }
  return new TextEncoder().encode(key || "dev-only-not-for-production");
}
const SECRET = getSecret();
const COOKIE_NAME = "cuestack-session";
const TOKEN_EXPIRY = "24h";
const BCRYPT_ROUNDS = 12;

// --- Password ---

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// --- JWT (now includes org_id + is_super_admin) ---

export async function createToken(user) {
  return new SignJWT({
    sub: String(user.id),
    username: user.username,
    role_id: user.role_id || null,
    org_id: user.org_id || null,
    is_super_admin: user.is_super_admin || false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// --- Session Cookie ---

export async function setSessionCookie(token) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true, // ASVS V3.4.2 — no JS access
    sameSite: "strict", // ASVS V3.4.3 — CSRF prevention
    secure: process.env.NODE_ENV === "production", // ASVS V3.4.1
    maxAge: 86400, // 24 hours
    path: "/",
  });
}

export async function getSessionCookie() {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value || null;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

// --- Get Current User ---

export async function getCurrentUser() {
  const token = await getSessionCookie();
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const result = await query(
    `SELECT u.id, u.username, u.role_id, u.org_id, u.is_super_admin,
            r.name as role_name,
            o.is_active as org_active,
            o.license_expires_at,
            o.plan as org_plan
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     LEFT JOIN organizations o ON u.org_id = o.id
     WHERE u.id = $1`,
    [payload.sub]
  );
  const user = result.rows[0] || null;
  if (!user) return null;

  // Super admin bypasses org checks
  if (user.is_super_admin) return user;

  // Check org is active
  if (user.org_id && user.org_active === false) {
    user._org_suspended = true;
    user._suspend_reason = "Organization is deactivated";
  }

  // Check license expiry
  if (user.license_expires_at) {
    const expires = new Date(user.license_expires_at);
    if (expires < new Date()) {
      user._org_suspended = true;
      user._suspend_reason = "License expired on " + expires.toLocaleDateString();
    }
  }

  return user;
}

// --- Role Helpers ---

export function isSuperAdmin(user) {
  return user && user.is_super_admin === true;
}

export function requireOrg(user) {
  if (!user || !user.org_id) return null;
  return user.org_id;
}

// --- Org License Check ---

export function isOrgSuspended(user) {
  return user?._org_suspended === true;
}

export function getOrgSuspendReason(user) {
  return user?._suspend_reason || "Organization suspended";
}

// --- Rate Limiting (DB-backed via audit_log, survives restarts) ---

const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;

export async function checkRateLimit(ip) {
  try {
    const result = await query(
      `SELECT COUNT(*) as attempts FROM audit_log
       WHERE ip_address = $1 AND action = 'login_failed'
         AND created_at > NOW() - INTERVAL '${WINDOW_MINUTES} minutes'`,
      [ip]
    );
    return parseInt(result.rows[0].attempts) < MAX_ATTEMPTS;
  } catch {
    // If DB query fails, allow login (fail-open for availability)
    return true;
  }
}

export async function recordFailedLogin(ip, username) {
  try {
    await query(
      `INSERT INTO audit_log (action, resource_type, resource_id, ip_address, details)
       VALUES ('login_failed', 'auth', $1, $2, $3)`,
      [username || "unknown", ip, JSON.stringify({ username })]
    );
  } catch {
    // Non-critical — don't block login flow
  }
}

export async function resetRateLimit(ip) {
  try {
    await query(
      `DELETE FROM audit_log WHERE ip_address = $1 AND action = 'login_failed'
         AND created_at > NOW() - INTERVAL '${WINDOW_MINUTES} minutes'`,
      [ip]
    );
  } catch {
    // Non-critical
  }
}

// --- Seed Data (dev only) ---

export async function seedData() {
  const { seedPermissions, createDefaultRoles, getAdminRoleId } = await import("./permissions.js");
  const { assignPlanFeatures } = await import("./features.js");

  // Skip seeding in production unless explicitly enabled
  if (process.env.NODE_ENV === "production" && process.env.SEED_DATA !== "true") return;
  if (process.env.SEED_DATA === "false") return;

  // Seed all permissions
  await seedPermissions();

  // Migrate legacy slugs (one-time, safe to re-run)
  await query("UPDATE organizations SET slug = 'acme' WHERE slug = 'aimagin'").catch(() => {});
  await query("UPDATE organizations SET slug = 'globex' WHERE slug = 'demo'").catch(() => {});

  // Seed primary org (enterprise = all features)
  const orgResult = await query(
    `INSERT INTO organizations (name, slug, plan)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, plan`,
    ["Acme Corp", "acme", "enterprise"]
  );
  const aimaginOrgId = orgResult.rows[0].id;
  await createDefaultRoles(aimaginOrgId);
  await assignPlanFeatures(aimaginOrgId, "enterprise");

  // Seed second org (free = basic features) — used for cross-org isolation tests
  const demoResult = await query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, plan`,
    ["Globex Inc", "globex"]
  );
  const demoOrgId = demoResult.rows[0].id;
  await createDefaultRoles(demoOrgId);
  await assignPlanFeatures(demoOrgId, "free");

  // Seed super admin (no org_id — platform-wide)
  const superExists = await query(
    "SELECT id FROM users WHERE username = $1 AND is_super_admin = true",
    ["admin"]
  );
  if (superExists.rows.length === 0) {
    const hash = await hashPassword("admin");
    await query(
      `INSERT INTO users (username, hashed_password, is_super_admin)
       VALUES ($1, $2, $3)`,
      ["admin", hash, true]
    );
    console.log("Seeded super admin (admin/admin)");
  }

  // Seed demo org admin
  const demoAdminRoleId = await getAdminRoleId(demoOrgId);
  const demoUserExists = await query(
    "SELECT id FROM users WHERE username = $1 AND org_id = $2",
    ["demo", demoOrgId]
  );
  if (demoUserExists.rows.length === 0) {
    const hash = await hashPassword("demo1234");
    await query(
      `INSERT INTO users (username, hashed_password, role_id, org_id)
       VALUES ($1, $2, $3, $4)`,
      ["demo", hash, demoAdminRoleId, demoOrgId]
    );
    console.log("Seeded demo org admin (demo/demo1234)");
  }
}
