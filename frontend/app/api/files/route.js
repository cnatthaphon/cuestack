import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import {
  listMyFiles, listSharedWithMe, listOrgFiles,
  uploadFile, createDirectory, deleteEntry, renameEntry, moveEntry,
  shareEntry, setVisibility, getAccessLevel,
  getStorageStats, getBreadcrumb, getEntry,
} from "../../../lib/org-files.js";
import { query } from "../../../lib/db.js";

// Get user's role IDs for access checks
async function getUserRoleIds(userId) {
  const res = await query("SELECT role_id FROM user_roles WHERE user_id = $1", [userId]);
  if (res.rows.length > 0) return res.rows.map((r) => r.role_id);
  // Fallback to legacy role_id
  const legacy = await query("SELECT role_id FROM users WHERE id = $1", [userId]);
  return legacy.rows[0]?.role_id ? [legacy.rows[0].role_id] : [];
}

// GET — list files by view
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "my";
  const parentId = searchParams.get("parent") || null;
  const roleIds = await getUserRoleIds(user.id);

  let files;
  if (view === "shared") {
    files = await listSharedWithMe(user.org_id, user.id, roleIds);
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
  if (!(await hasPermission(user, "files.upload"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = request.headers.get("content-type") || "";
  const roleIds = await getUserRoleIds(user.id);

  if (contentType.includes("application/json")) {
    const body = await request.json();

    if (body.action === "mkdir") {
      // Editors can create folders inside shared folders
      if (body.parent_id) {
        const parent = await getEntry(user.org_id, body.parent_id);
        const access = getAccessLevel(parent, user.id, roleIds);
        if (!access || access === "viewer") return NextResponse.json({ error: "No write access to this folder" }, { status: 403 });
      }
      const entry = await createDirectory(user.org_id, body.name, body.parent_id, user.id, body.visibility || "private");
      return NextResponse.json({ entry }, { status: 201 });
    }

    if (body.action === "rename") {
      const entry = await getEntry(user.org_id, body.id);
      if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const access = getAccessLevel(entry, user.id, roleIds);
      if (access !== "owner") return NextResponse.json({ error: "Only owner can rename" }, { status: 403 });
      await renameEntry(user.org_id, body.id, body.name);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move") {
      const entry = await getEntry(user.org_id, body.id);
      if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const access = getAccessLevel(entry, user.id, roleIds);
      if (access !== "owner") return NextResponse.json({ error: "Only owner can move" }, { status: 403 });
      try {
        await moveEntry(user.org_id, body.id, body.parent_id || null);
        return NextResponse.json({ ok: true });
      } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
    }

    if (body.action === "share") {
      const entry = await getEntry(user.org_id, body.id);
      if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Only owner can share" }, { status: 403 });
      // share_with: [{ type, id, access }]
      await shareEntry(user.org_id, body.id, body.share_with || []);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_visibility") {
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

    // Check editor access if uploading into a shared folder
    if (parentId) {
      const parent = await getEntry(user.org_id, parentId);
      const access = getAccessLevel(parent, user.id, roleIds);
      if (!access || access === "viewer") return NextResponse.json({ error: "No write access to this folder" }, { status: 403 });
    }

    if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const entry = await uploadFile(user.org_id, file.name, parentId, buffer, file.type, user.id, visibility);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// DELETE — owner only
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const entry = await getEntry(user.org_id, id);
  if (!entry || entry.created_by !== user.id) return NextResponse.json({ error: "Only owner can delete" }, { status: 403 });

  await deleteEntry(user.org_id, id);
  return NextResponse.json({ ok: true });
}
