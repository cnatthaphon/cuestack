import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import {
  verifyPassword,
  createToken,
  setSessionCookie,
  checkRateLimit,
  resetRateLimit,
  recordFailedLogin,
} from "../../../../lib/auth.js";

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in 15 minutes." },
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
    const result = await query(
      `SELECT u.id, u.username, u.hashed_password, u.role_id, u.org_id, u.is_super_admin,
              o.name as org_name, o.slug as org_slug, r.name as role_name
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1 AND o.slug = $2 AND o.is_active = true`,
      [username, org_slug]
    );
    user = result.rows[0];
  } else {
    const result = await query(
      `SELECT u.id, u.username, u.hashed_password, u.role_id, u.org_id, u.is_super_admin,
              r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1`,
      [username]
    );
    user = result.rows.find((r) => r.is_super_admin) || result.rows[0];
  }

  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    await recordFailedLogin(ip, username);
    return NextResponse.json({ error: "Bad credentials" }, { status: 401 });
  }

  await resetRateLimit(ip);
  const token = await createToken(user);
  await setSessionCookie(token);

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role_id: user.role_id,
      role_name: user.role_name || null,
      org_id: user.org_id,
      org_name: user.org_name || null,
      org_slug: user.org_slug || null,
      is_super_admin: user.is_super_admin,
    },
  });
}
