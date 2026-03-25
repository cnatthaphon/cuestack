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

  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 }
    );
  }

  // Find user
  const result = await query(
    "SELECT id, username, hashed_password, role FROM users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    return NextResponse.json({ error: "Bad credentials" }, { status: 401 });
  }

  // Success — reset rate limit, create session
  resetRateLimit(ip);
  const token = await createToken(user);
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
  });
}
