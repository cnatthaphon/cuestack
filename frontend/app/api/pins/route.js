import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import { getConfig, setConfig } from "../../../lib/org-config.js";
import { hasPermission } from "../../../lib/permissions.js";

const MAX_PERSONAL_PINS = 7;
const MAX_ORG_PINS = 10;

// GET — get personal + org pins
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Personal pins (from user config)
  const userPins = await getConfig(user.org_id, "user_pins", String(user.id));
  const personalIds = userPins?.page_ids || [];

  // Org pins (admin-set, visible to all)
  const orgPins = await getConfig(user.org_id, "org_pins", "default");
  const orgIds = orgPins?.page_ids || [];

  // Fetch page details for all pinned IDs
  const allIds = [...new Set([...orgIds, ...personalIds])];
  let pages = [];
  if (allIds.length > 0) {
    const result = await query(
      `SELECT id, name, slug, icon, page_type, entry_type, status, visibility
       FROM user_pages WHERE id = ANY($1::uuid[]) AND org_id = $2`,
      [allIds, user.org_id]
    );
    pages = result.rows;
  }

  const pageMap = Object.fromEntries(pages.map((p) => [p.id, p]));

  return NextResponse.json({
    personal: personalIds.map((id) => pageMap[id]).filter(Boolean),
    org: orgIds.map((id) => pageMap[id]).filter(Boolean),
    personal_ids: personalIds,
    org_ids: orgIds,
  });
}

// POST — pin/unpin
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { action, page_id, scope } = await request.json();
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

  // Verify page exists in org
  const page = await query("SELECT id FROM user_pages WHERE id = $1 AND org_id = $2", [page_id, user.org_id]);
  if (!page.rows[0]) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (scope === "org") {
    // Org pins — requires org.settings permission
    if (!user.is_super_admin && !(await hasPermission(user, "org.settings"))) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    const current = await getConfig(user.org_id, "org_pins", "default");
    let ids = current?.page_ids || [];

    if (action === "pin") {
      if (!ids.includes(page_id) && ids.length < MAX_ORG_PINS) ids.push(page_id);
    } else {
      ids = ids.filter((id) => id !== page_id);
    }

    await setConfig(user.org_id, "org_pins", "default", { page_ids: ids });
    return NextResponse.json({ ok: true, org_ids: ids });
  }

  // Personal pins
  const current = await getConfig(user.org_id, "user_pins", String(user.id));
  let ids = current?.page_ids || [];

  if (action === "pin") {
    if (!ids.includes(page_id) && ids.length < MAX_PERSONAL_PINS) ids.push(page_id);
  } else {
    ids = ids.filter((id) => id !== page_id);
  }

  await setConfig(user.org_id, "user_pins", String(user.id), { page_ids: ids });
  return NextResponse.json({ ok: true, personal_ids: ids });
}
