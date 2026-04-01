import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { getService, updateServiceStatus, deleteService } from "../../../../lib/org-services.js";

// GET — get service details
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { id } = await params;
  const service = await getService(user.org_id, id);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({ service });
}

// PATCH — update service status (start/stop)
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "services.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = await request.json();

  const service = await getService(user.org_id, id);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  if (action === "start") {
    // For POC: mark as running (actual process spawning would go here)
    await updateServiceStatus(user.org_id, id, "running", null);
    return NextResponse.json({ ok: true, status: "running" });
  }

  if (action === "stop") {
    await updateServiceStatus(user.org_id, id, "stopped", null);
    return NextResponse.json({ ok: true, status: "stopped" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE — remove service
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "services.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await deleteService(user.org_id, id);
  if (!deleted) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
