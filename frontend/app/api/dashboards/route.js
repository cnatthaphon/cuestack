import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { hasFeature } from "../../../lib/features.js";
import { listDashboards, createDashboard, getPublishedDashboards } from "../../../lib/org-dashboards.js";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { searchParams } = new URL(request.url);

  // ?published=true — for nav
  if (searchParams.get("published") === "true") {
    const dashboards = await getPublishedDashboards(user.org_id);
    return NextResponse.json({ dashboards });
  }

  if (!(await hasPermission(user, "dashboard.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dashboards = await listDashboards(user.org_id);
  return NextResponse.json({ dashboards });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "dashboards");
  if (!enabled) return NextResponse.json({ error: "Dashboards not enabled" }, { status: 403 });
  if (!(await hasPermission(user, "dashboard.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  try {
    const dashboard = await createDashboard(user.org_id, body, user.id);
    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (e) {
    if (e.code === "23505") return NextResponse.json({ error: "Dashboard slug already exists" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
