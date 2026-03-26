import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { listFiles, uploadFile, createDirectory, deleteEntry, renameEntry, moveEntry, getStorageStats, getBreadcrumb } from "../../../lib/org-files.js";

// GET — list files in directory
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parent") || null;

  const [files, storage, breadcrumb] = await Promise.all([
    listFiles(user.org_id, parentId),
    getStorageStats(user.org_id),
    parentId ? getBreadcrumb(user.org_id, parentId) : [],
  ]);

  return NextResponse.json({ files, storage, breadcrumb, parent_id: parentId });
}

// POST — upload file, create directory, rename, or move
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.upload"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";

  // JSON actions: mkdir, rename, move
  if (contentType.includes("application/json")) {
    const body = await request.json();

    if (body.action === "mkdir") {
      const entry = await createDirectory(user.org_id, body.name, body.parent_id, user.id);
      return NextResponse.json({ entry }, { status: 201 });
    }

    if (body.action === "rename") {
      if (!body.id || !body.name) return NextResponse.json({ error: "ID and name required" }, { status: 400 });
      await renameEntry(user.org_id, body.id, body.name);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move") {
      if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });
      try {
        await moveEntry(user.org_id, body.id, body.parent_id || null);
        return NextResponse.json({ ok: true });
      } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // FormData = file upload
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const parentId = formData.get("parent_id") || null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const entry = await uploadFile(user.org_id, file.name, parentId, buffer, file.type, user.id);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// DELETE — delete file or directory
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

  const deleted = await deleteEntry(user.org_id, id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
