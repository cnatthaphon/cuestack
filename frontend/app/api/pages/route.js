import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import { hasPermission as checkPerm, getUserPermissions } from "../../../lib/permissions.js";
import { hasFeature } from "../../../lib/features.js";

// GET — list pages (tree for nav, or by view)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "my";
  const typeFilter = searchParams.get("type"); // filter by page_type (e.g., ?type=notebook)

  // Filtered view by page_type — returns all org pages of that type
  if (typeFilter) {
    const VALID_TYPES = ["dashboard", "html", "visual", "notebook", "python"];
    if (!VALID_TYPES.includes(typeFilter)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const result = await query(
      `SELECT p.id, p.name, p.slug, p.icon, p.page_type, p.config, p.visibility, p.updated_at,
              u.username
       FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.org_id = $1 AND p.page_type = $2 AND p.entry_type = 'page'
       ORDER BY p.updated_at DESC`,
      [user.org_id, typeFilter]
    );
    return NextResponse.json({ pages: result.rows });
  }

  if (view === "shared") {
    const roleIds = await getRoleIds(user.id);
    const conditions = ["p.visibility = 'org'"];
    const params = [user.org_id, user.id];
    let i = 3;
    conditions.push(`p.shared_with @> $${i}::jsonb`);
    params.push(JSON.stringify([{ type: "user", id: user.id }]));
    i++;
    for (const rid of roleIds) {
      conditions.push(`p.shared_with @> $${i}::jsonb`);
      params.push(JSON.stringify([{ type: "role", id: rid }]));
      i++;
    }
    const result = await query(
      `SELECT p.*, u.username as owner_name FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.org_id = $1 AND p.user_id != $2 AND p.entry_type = 'page' AND (${conditions.join(" OR ")})
       ORDER BY p.updated_at DESC`,
      params
    );

    // Filter out page types the user lacks permission to access
    let pages = result.rows;
    if (!user.is_super_admin) {
      const userPerms = await getUserPermissions(user.id, user.role_id);
      const permSet = new Set(userPerms);
      // Map page_type → required permission
      const TYPE_PERM_MAP = {
        notebook: "notebooks.use",
        dashboard: "dashboard.view",
        python: "services.manage",
      };
      pages = pages.filter((p) => {
        const requiredPerm = TYPE_PERM_MAP[p.page_type];
        // If no specific permission required (html, visual, etc.), allow
        if (!requiredPerm) return true;
        return permSet.has(requiredPerm);
      });
    }

    return NextResponse.json({ pages });
  }

  if (view === "published") {
    const slug = searchParams.get("slug");
    const conditions = ["p.org_id = $1", "p.status = 'published'", "p.entry_type = 'page'"];
    const params = [user.org_id];
    if (slug) { conditions.push(`p.slug = $${params.length + 1}`); params.push(slug); }
    const result = await query(
      `SELECT p.*, u.username as owner_name FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.name`,
      params
    );
    return NextResponse.json({ pages: result.rows });
  }

  if (view === "public") {
    const result = await query(
      `SELECT p.*, u.username as owner_name FROM user_pages p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.org_id = $1 AND p.visibility = 'public' AND p.entry_type = 'page'
       ORDER BY p.name`,
      [user.org_id]
    );
    return NextResponse.json({ pages: result.rows });
  }

  // My pages — full tree
  const result = await query(
    `SELECT id, name, slug, icon, page_type, entry_type, parent_id, status, visibility, sort_order, permission_id, (config ? 'schedule') as has_schedule FROM user_pages WHERE org_id = $1 AND user_id = $2 ORDER BY entry_type DESC, sort_order, name`,
    [user.org_id, user.id]
  );
  return NextResponse.json({ pages: result.rows });
}

// POST — create page or folder (requires pages.create)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const canCreate = user.is_super_admin || await checkPerm(user, "pages.create");
  if (!canCreate) return NextResponse.json({ error: "Permission denied: pages.create required" }, { status: 403 });

  const { name, icon, parent_id, entry_type, page_type, slug } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const type = entry_type === "folder" ? "folder" : "page";
  const pType = ["dashboard", "html", "visual", "notebook", "python"].includes(page_type) ? page_type : "dashboard";

  // Feature gate — enforce org feature flags per page type
  const FEATURE_MAP = { html: "app_builder", visual: "app_builder", notebook: "notebooks", python: "python_services" };
  const requiredFeature = FEATURE_MAP[pType];
  if (requiredFeature && !(await hasFeature(user.org_id, requiredFeature))) {
    return NextResponse.json({ error: `Feature '${requiredFeature}' not enabled for your organization` }, { status: 403 });
  }
  const defaultIcons = { folder: "\u{1F4C1}", dashboard: "\u{1F4CA}", html: "\u{1F310}", visual: "\u{1F9E9}", notebook: "\u{1F4D3}", python: "\u{1F40D}" };

  // Generate slug for pages
  const pageSlug = slug || name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Default config based on type
  const defaultConfig = { dashboard: { widgets: [], layout: { columns: 2 } }, html: {}, visual: { blocks: [] }, notebook: {}, python: { code: "# Python service\nimport os, time\n\nORG_ID = os.getenv('ORG_ID', '')\nMQTT_BROKER = os.getenv('MQTT_BROKER', 'mqtt')\nMQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))\nDATABASE_URL = os.getenv('DATABASE_URL', '')\n\nprint(f'Service started (org={ORG_ID})')\n\nwhile True:\n    # Your service logic here\n    time.sleep(1)\n" } };

  const result = await query(
    `INSERT INTO user_pages (org_id, user_id, name, slug, icon, page_type, entry_type, parent_id, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [user.org_id, user.id, name, type === "folder" ? null : pageSlug,
     icon || defaultIcons[type === "folder" ? "folder" : pType],
     pType, type, parent_id || null, JSON.stringify(defaultConfig[pType] || {})]
  );
  return NextResponse.json({ page: result.rows[0] }, { status: 201 });
}

async function getRoleIds(userId) {
  const res = await query("SELECT role_id FROM user_roles WHERE user_id = $1", [userId]);
  if (res.rows.length > 0) return res.rows.map((r) => r.role_id);
  const legacy = await query("SELECT role_id FROM users WHERE id = $1", [userId]);
  return legacy.rows[0]?.role_id ? [legacy.rows[0].role_id] : [];
}
