import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { downloadFile } from "../../../../lib/org-files.js";

// GET — download a file
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!(await hasPermission(user, "files.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "Path required" }, { status: 400 });

  try {
    const { buffer, filename } = await downloadFile(user.org_id, filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
}
