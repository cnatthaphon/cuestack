import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";

// POST /api/channels/publish — publish data to a channel via backend
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { channel, data } = await request.json();
  if (!channel) return NextResponse.json({ error: "Channel required" }, { status: 400 });

  // Forward to backend's channel publish endpoint
  const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";
  try {
    const res = await fetch(`${BACKEND_URL}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: user.org_id, channel, data }),
    });
    const result = await res.json().catch(() => ({}));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
