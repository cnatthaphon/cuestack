import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { getDashboard, updateDashboard, deleteDashboard, publishDashboard, unpublishDashboard } from "../../../../lib/org-dashboards.js";

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const dashboard = await getDashboard(user.org_id, id);
  if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  return NextResponse.json({ dashboard });
}

export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasPermission(user, "dashboard.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.action === "publish") {
    if (!(await hasPermission(user, "dashboard.publish"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await publishDashboard(user.org_id, id);
    return NextResponse.json({ ok: true, ...result });
  }
  if (body.action === "unpublish") {
    await unpublishDashboard(user.org_id, id);
    return NextResponse.json({ ok: true });
  }

  await updateDashboard(user.org_id, id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasPermission(user, "dashboard.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await deleteDashboard(user.org_id, id);
  if (!deleted) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
