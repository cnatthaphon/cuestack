import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasFeature } from "../../../lib/features.js";
import { listApps, createApp, getPublishedApps } from "../../../lib/org-apps.js";

// GET — list apps (all for builders, published for nav)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { searchParams } = new URL(request.url);

  // ?published=true — for nav menu (returns only published apps)
  if (searchParams.get("published") === "true") {
    const apps = await getPublishedApps(user.org_id);
    return NextResponse.json({ apps });
  }

  const enabled = await hasFeature(user.org_id, "app_builder");
  if (!enabled) return NextResponse.json({ error: "App Builder not enabled" }, { status: 403 });

  const apps = await listApps(user.org_id);
  return NextResponse.json({ apps });
}

// POST — create app
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "app_builder");
  if (!enabled) return NextResponse.json({ error: "App Builder not enabled" }, { status: 403 });

  const body = await request.json();
  try {
    const app = await createApp(user.org_id, body, user.id);
    return NextResponse.json({ app }, { status: 201 });
  } catch (e) {
    if (e.code === "23505") return NextResponse.json({ error: "App slug already exists" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
