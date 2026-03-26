import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import {
  listMyFiles, listSharedWithMe, listOrgFiles,
  uploadFile, createDirectory, deleteEntry, renameEntry, moveEntry,
  shareEntry, setVisibility,
  getStorageStats, getBreadcrumb, getEntry, canAccess,
} from "../../../lib/org-files.js";
import { query } from "../../../lib/db.js";

// GET — list files by view
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "my"; // my | shared | org
  const parentId = searchParams.get("parent") || null;

  let files;
  if (view === "shared") {
    files = await listSharedWithMe(user.org_id, user.id, user.role_id);
  } else if (view === "org") {
    files = await listOrgFiles(user.org_id, parentId);
  } else {
    files = await listMyFiles(user.org_id, user.id, parentId);
  }

  const [storage, breadcrumb] = await Promise.all([
    getStorageStats(user.org_id),
    parentId ? getBreadcrumb(user.org_id, parentId) : [],
  ]);

  return NextResponse.json({ files, storage, breadcrumb, view, parent_id: parentId });
}

// POST — upload, mkdir, rename, move, share, set visibility
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.upload"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();

    if (body.action === "mkdir") {
      const entry = await createDirectory(user.org_id, body.name, body.parent_id, user.id, body.visibility || "private");
      return NextResponse.json({ entry }, { status: 201 });
    }

    if (body.action === "rename") {
      if (!body.id || !body.name) return NextResponse.json({ error: "ID and name required" }, { status: 400 });
      const entry = await getEntry(user.org_id, body.id);
      if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Not your file" }, { status: 403 });
      await renameEntry(user.org_id, body.id, body.name);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move") {
      if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
      const entry = await getEntry(user.org_id, body.id);
      if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Not your file" }, { status: 403 });
      try {
        await moveEntry(user.org_id, body.id, body.parent_id || null);
        return NextResponse.json({ ok: true });
      } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
    }

    if (body.action === "share") {
      if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
      const entry = await getEntry(user.org_id, body.id);
      if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Only owner can share" }, { status: 403 });
      await shareEntry(user.org_id, body.id, body.share_with || []);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_visibility") {
      if (!body.id || !body.visibility) return NextResponse.json({ error: "ID and visibility required" }, { status: 400 });
      const entry = await getEntry(user.org_id, body.id);
      if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Only owner can change visibility" }, { status: 403 });
      try {
        await setVisibility(user.org_id, body.id, body.visibility);
        return NextResponse.json({ ok: true });
      } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // FormData = file upload
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const parentId = formData.get("parent_id") || null;
    const visibility = formData.get("visibility") || "private";

    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const entry = await uploadFile(user.org_id, file.name, parentId, buffer, file.type, user.id, visibility);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// DELETE
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const entry = await getEntry(user.org_id, id);
  if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Only owner can delete" }, { status: 403 });

  await deleteEntry(user.org_id, id);
  return NextResponse.json({ ok: true });
}
