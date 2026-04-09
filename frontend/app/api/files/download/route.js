import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { getEntry, getAccessLevel, downloadFile } from "../../../../lib/org-files.js";

// GET — download a file by ID
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "File ID required" }, { status: 400 });

  const entry = await getEntry(user.org_id, id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roleIds = user.role_id ? [user.role_id] : [];
  const access = getAccessLevel(entry, user.id, roleIds);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  try {
    const { buffer, filename, mime_type } = await downloadFile(user.org_id, id);
    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": mime_type || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
}
