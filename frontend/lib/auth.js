import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query } from "./db.js";

const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);
const COOKIE_NAME = "iot-session";
const TOKEN_EXPIRY = "24h";
const BCRYPT_ROUNDS = 12;

// --- Password ---

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// --- JWT ---

export async function createToken(user) {
  return new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
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

  const result = await query("SELECT id, username, role FROM users WHERE id = $1", [
    payload.sub,
  ]);
  return result.rows[0] || null;
}

// --- Rate Limiting (in-memory, resets on restart) ---

const loginAttempts = new Map(); // IP → { count, resetAt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute

export function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false; // Locked out (ASVS V2.2.1)
  }

  entry.count++;
  return true;
}

export function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// --- Seed Admin (dev only) ---

export async function seedAdmin() {
  if (process.env.SEED_ADMIN === "false") return;

  const existing = await query("SELECT id FROM users WHERE username = $1", [
    "admin",
  ]);
  if (existing.rows.length > 0) return;

  const hash = await hashPassword("admin");
  await query(
    "INSERT INTO users (username, hashed_password, role) VALUES ($1, $2, $3)",
    ["admin", hash, "admin"]
  );
  console.log("Seeded admin user (admin/admin)");
}
