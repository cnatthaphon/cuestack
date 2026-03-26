import { query } from "./db.js";

// Widget types available in the builder
export const WIDGET_TYPES = [
  { id: "stat", label: "Stat Card", icon: "\u{1F4CA}", description: "Single metric with label" },
  { id: "line", label: "Line Chart", icon: "\u{1F4C8}", description: "Time series line chart" },
  { id: "bar", label: "Bar Chart", icon: "\u{1F4CA}", description: "Bar chart comparison" },
  { id: "table", label: "Data Table", icon: "\u{1F4CB}", description: "Tabular data display" },
  { id: "text", label: "Text / Markdown", icon: "\u{1F4DD}", description: "Static text or notes" },
  { id: "pie", label: "Pie Chart", icon: "\u{1F967}", description: "Distribution pie chart" },
];

export async function listDashboards(orgId) {
  const result = await query(
    `SELECT d.id, d.name, d.slug, d.description, d.status, d.permission_id,
            d.created_at, d.updated_at, u.username as created_by_name,
            jsonb_array_length(d.widgets) as widget_count
     FROM org_dashboards d LEFT JOIN users u ON d.created_by = u.id
     WHERE d.org_id = $1 ORDER BY d.name`,
    [orgId]
  );
  return result.rows;
}

export async function getDashboard(orgId, dashId) {
  const result = await query(
    "SELECT * FROM org_dashboards WHERE id = $1 AND org_id = $2",
    [dashId, orgId]
  );
  return result.rows[0] || null;
}

export async function getDashboardBySlug(orgId, slug) {
  const result = await query(
    "SELECT * FROM org_dashboards WHERE slug = $1 AND org_id = $2",
    [slug, orgId]
  );
  return result.rows[0] || null;
}

export async function createDashboard(orgId, { name, slug, description }, userId) {
  if (!name) throw new Error("Dashboard name required");
  if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error("Slug must be lowercase, start with letter, only a-z 0-9 -");
  }

  const result = await query(
    `INSERT INTO org_dashboards (org_id, name, slug, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, name, slug, description || "", userId]
  );
  return result.rows[0];
}

export async function updateDashboard(orgId, dashId, { widgets, layout, name, description }) {
  const sets = ["updated_at = NOW()"];
  const values = [dashId, orgId];
  let i = 3;
  if (widgets !== undefined) { sets.push(`widgets = $${i}`); values.push(JSON.stringify(widgets)); i++; }
  if (layout !== undefined) { sets.push(`layout = $${i}`); values.push(JSON.stringify(layout)); i++; }
  if (name !== undefined) { sets.push(`name = $${i}`); values.push(name); i++; }
  if (description !== undefined) { sets.push(`description = $${i}`); values.push(description); i++; }

  await query(`UPDATE org_dashboards SET ${sets.join(", ")} WHERE id = $1 AND org_id = $2`, values);
}

export async function publishDashboard(orgId, dashId) {
  const dash = await getDashboard(orgId, dashId);
  if (!dash) throw new Error("Dashboard not found");

  const permId = `app.dash.${dash.slug}`;

  await query(
    `INSERT INTO permissions (id, category, label, description, type, org_id)
     VALUES ($1, 'dashboards', $2, $3, 'app', $4)
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`,
    [permId, `View ${dash.name}`, `Access the ${dash.name} dashboard`, orgId]
  );

  await query(
    "UPDATE org_dashboards SET status = 'published', permission_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
    [permId, dashId, orgId]
  );
  return { permission_id: permId };
}

export async function unpublishDashboard(orgId, dashId) {
  await query(
    "UPDATE org_dashboards SET status = 'draft', updated_at = NOW() WHERE id = $1 AND org_id = $2",
    [dashId, orgId]
  );
}

export async function deleteDashboard(orgId, dashId) {
  const dash = await getDashboard(orgId, dashId);
  if (!dash) return null;

  if (dash.permission_id) {
    await query("DELETE FROM role_permissions WHERE permission_id = $1", [dash.permission_id]);
    await query("DELETE FROM permissions WHERE id = $1 AND org_id = $2", [dash.permission_id, orgId]);
  }

  await query("DELETE FROM org_dashboards WHERE id = $1 AND org_id = $2", [dashId, orgId]);
  return dash;
}

export async function getPublishedDashboards(orgId) {
  const result = await query(
    "SELECT id, name, slug, permission_id FROM org_dashboards WHERE org_id = $1 AND status = 'published' ORDER BY name",
    [orgId]
  );
  return result.rows;
}
