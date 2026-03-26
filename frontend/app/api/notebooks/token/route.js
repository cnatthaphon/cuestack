import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || "dev-secret-change-in-prod"
);

// POST — generate a notebook session token (scoped to user + org)
// This token is passed to the Jupyter kernel as env var
// The SDK uses it to call platform APIs on behalf of the user
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  // Create a scoped JWT — valid for 24h, contains user context
  const token = await new SignJWT({
    sub: user.id,
    username: user.username,
    org_id: user.org_id,
    role_id: user.role_id,
    type: "notebook",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(SECRET);

  return NextResponse.json({
    token,
    user_id: user.id,
    username: user.username,
    org_id: user.org_id,
  });
}
