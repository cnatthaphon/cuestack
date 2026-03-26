import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { hasPermission } from "../../../lib/permissions.js";
import { listFiles, uploadFile, createDir, deleteFile, getStorageStats } from "../../../lib/org-files.js";

// GET — list files + storage stats
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dir = searchParams.get("path") || "/";

  const [files, stats] = await Promise.all([
    listFiles(user.org_id, dir),
    getStorageStats(user.org_id),
  ]);

  return NextResponse.json({ files, storage: stats, path: dir });
}

// POST — upload file or create directory
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.upload"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";

  // JSON request = create directory
  if (contentType.includes("application/json")) {
    const { path: dirPath, action } = await request.json();
    if (action === "mkdir" && dirPath) {
      const result = await createDir(user.org_id, dirPath);
      return NextResponse.json(result, { status: 201 });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // FormData = file upload
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const dir = formData.get("path") || "/";

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 50MB max per file
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = dir === "/" ? `/${file.name}` : `${dir}/${file.name}`;
    const result = await uploadFile(user.org_id, filePath, buffer);

    return NextResponse.json(result, { status: 201 });
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
  const filePath = searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "Path required" }, { status: 400 });

  try {
    await deleteFile(user.org_id, filePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
