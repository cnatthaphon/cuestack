import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { getApp, updateApp, deleteApp, publishApp, unpublishApp } from "../../../../lib/org-apps.js";

// GET — get app details
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const app = await getApp(user.org_id, id);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  return NextResponse.json({ app });
}

// PATCH — update app or publish/unpublish
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Publish/unpublish actions
  if (body.action === "publish") {
    try {
      const result = await publishApp(user.org_id, id);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
  if (body.action === "unpublish") {
    await unpublishApp(user.org_id, id);
    return NextResponse.json({ ok: true });
  }

  // Update fields
  await updateApp(user.org_id, id, body);
  return NextResponse.json({ ok: true });
}

// DELETE — remove app + its permission
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const deleted = await deleteApp(user.org_id, id);
  if (!deleted) return NextResponse.json({ error: "App not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
