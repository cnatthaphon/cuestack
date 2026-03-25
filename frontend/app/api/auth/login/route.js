import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import {
  verifyPassword,
  createToken,
  setSessionCookie,
  checkRateLimit,
  resetRateLimit,
} from "../../../../lib/auth.js";

export async function POST(request) {
  // Rate limiting (ASVS V2.2.1)
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in 1 minute." },
      { status: 429 }
    );
  }

  const { username, password, org_slug } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 }
    );
  }

  let user;

  if (org_slug) {
    // Org-scoped login: find user within specific org
    const result = await query(
      `SELECT u.id, u.username, u.hashed_password, u.role, u.org_id, u.is_super_admin,
              o.name as org_name, o.slug as org_slug
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE u.username = $1 AND o.slug = $2 AND o.is_active = true`,
      [username, org_slug]
    );
    user = result.rows[0];
  } else {
    // No org specified — try super admin first, then any user
    const result = await query(
      `SELECT id, username, hashed_password, role, org_id, is_super_admin
       FROM users WHERE username = $1`,
      [username]
    );
    // Prefer super admin if multiple matches
    user = result.rows.find((r) => r.is_super_admin) || result.rows[0];
  }

  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    return NextResponse.json({ error: "Bad credentials" }, { status: 401 });
  }

  // Success
  resetRateLimit(ip);
  const token = await createToken(user);
  await setSessionCookie(token);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      org_id: user.org_id,
      org_name: user.org_name || null,
      org_slug: user.org_slug || null,
      is_super_admin: user.is_super_admin,
    },
  });
}
