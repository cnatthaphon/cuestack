import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { hasFeature } from "../../../lib/features.js";
import { listServices, createService } from "../../../lib/org-services.js";

// GET — list services
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "python_services");
  if (!enabled) return NextResponse.json({ error: "Python Services not enabled" }, { status: 403 });

  const services = await listServices(user.org_id);
  return NextResponse.json({ services });
}

// POST — create service
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const enabled = await hasFeature(user.org_id, "python_services");
  if (!enabled) return NextResponse.json({ error: "Python Services not enabled" }, { status: 403 });
  if (!(await hasPermission(user, "services.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  try {
    const service = await createService(user.org_id, body, user.id);
    return NextResponse.json({ service }, { status: 201 });
  } catch (e) {
    if (e.code === "23505") {
      return NextResponse.json({ error: "Service name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
