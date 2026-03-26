import { query } from "./db.js";

export const APP_TYPES = [
  { id: "html", label: "HTML / JS", description: "Static web app (HTML, CSS, JavaScript)" },
  { id: "dash", label: "Dash (Python)", description: "Python Dash dashboard app" },
  { id: "visual", label: "Visual Flow", description: "Block-based visual programming" },
];

export async function listApps(orgId) {
  const result = await query(
    `SELECT a.*, u.username as created_by_name
     FROM org_apps a LEFT JOIN users u ON a.created_by = u.id
     WHERE a.org_id = $1 ORDER BY a.name`,
    [orgId]
  );
  return result.rows;
}

export async function getApp(orgId, appId) {
  const result = await query(
    "SELECT * FROM org_apps WHERE id = $1 AND org_id = $2",
    [appId, orgId]
  );
  return result.rows[0] || null;
}

export async function getAppBySlug(orgId, slug) {
  const result = await query(
    "SELECT * FROM org_apps WHERE slug = $1 AND org_id = $2",
    [slug, orgId]
  );
  return result.rows[0] || null;
}

export async function createApp(orgId, { name, slug, description, app_type, icon, entrypoint }, userId) {
  if (!name) throw new Error("App name required");
  if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error("Slug must be lowercase, start with letter, only a-z 0-9 -");
  }
  if (slug.length > 100) throw new Error("Slug too long (max 100)");
  if (!APP_TYPES.find((t) => t.id === app_type)) {
    throw new Error("Invalid app type");
  }

  const result = await query(
    `INSERT INTO org_apps (org_id, name, slug, description, app_type, icon, entrypoint, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, name, slug, description || "", app_type, icon || "\u{1F4F1}", entrypoint || "index.html", userId]
  );
  return result.rows[0];
}

// Publish: creates app permission, sets status to published
export async function publishApp(orgId, appId) {
  const app = await getApp(orgId, appId);
  if (!app) throw new Error("App not found");

  const permId = `app.${app.slug}`;

  // Create app permission if not exists
  await query(
    `INSERT INTO permissions (id, category, label, description, type, org_id)
     VALUES ($1, 'apps', $2, $3, 'app', $4)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    [permId, `Access ${app.name}`, `View and use the ${app.name} app`, orgId]
  );

  // Update app status and link permission
  await query(
    "UPDATE org_apps SET status = 'published', permission_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [permId, appId, orgId]
  );

  return { permission_id: permId };
}

// Unpublish: sets status back to draft (keeps permission for re-publish)
export async function unpublishApp(orgId, appId) {
  await query(
    "UPDATE org_apps SET status = 'draft', updated_at = NOW() WHERE id = $1 AND org_id = $2",
    [appId, orgId]
  );
}

export async function updateApp(orgId, appId, updates) {
  const allowed = ["name", "description", "icon", "entrypoint", "config"];
  const sets = [];
  const values = [appId, orgId];
  let i = 3;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${i}`);
      values.push(key === "config" ? JSON.stringify(updates[key]) : updates[key]);
      i++;
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = NOW()");
  await query(`UPDATE org_apps SET ${sets.join(", ")} WHERE id = $1 AND org_id = $2`, values);
}

export async function deleteApp(orgId, appId) {
  const app = await getApp(orgId, appId);
  if (!app) return null;

  // Remove app permission if exists
  if (app.permission_id) {
    // Remove from role_permissions first
    await query("DELETE FROM role_permissions WHERE permission_id = $1", [app.permission_id]);
    await query("DELETE FROM permissions WHERE id = $1 AND org_id = $2", [app.permission_id, orgId]);
  }

  await query("DELETE FROM org_apps WHERE id = $1 AND org_id = $2", [appId, orgId]);
  return app;
}

// Get published apps for nav (only apps user has permission for)
export async function getPublishedApps(orgId) {
  const result = await query(
    "SELECT id, name, slug, icon, permission_id, app_type FROM org_apps WHERE org_id = $1 AND status = 'published' ORDER BY name",
    [orgId]
  );
  return result.rows;
}
