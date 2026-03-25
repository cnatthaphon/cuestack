import { query } from "./db.js";

// --- System Permissions (Aimagin-defined, platform-wide) ---

export const SYSTEM_PERMISSIONS = [
  { id: "users.view", category: "users", label: "View Users", description: "View user list" },
  { id: "users.create", category: "users", label: "Create Users", description: "Create new users" },
  { id: "users.edit", category: "users", label: "Edit Users", description: "Edit user roles/password" },
  { id: "users.delete", category: "users", label: "Delete Users", description: "Delete users" },
  { id: "data.ingest", category: "data", label: "Ingest Data", description: "Send data to pipeline" },
  { id: "data.query", category: "data", label: "Query Data", description: "Query data" },
  { id: "data.export", category: "data", label: "Export Data", description: "Export data as CSV" },
  { id: "dashboard.view", category: "dashboard", label: "View Dashboards", description: "View dashboards" },
  { id: "dashboard.create", category: "dashboard", label: "Create Dashboards", description: "Create dashboards" },
  { id: "dashboard.edit", category: "dashboard", label: "Edit Dashboards", description: "Edit dashboards" },
  { id: "dashboard.publish", category: "dashboard", label: "Publish Dashboards", description: "Publish dashboards" },
  { id: "devices.view", category: "devices", label: "View Devices", description: "View device list" },
  { id: "devices.create", category: "devices", label: "Register Devices", description: "Register devices" },
  { id: "devices.edit", category: "devices", label: "Edit Devices", description: "Edit device config" },
  { id: "devices.delete", category: "devices", label: "Remove Devices", description: "Remove devices" },
  { id: "db.view", category: "database", label: "View Databases", description: "View database tables" },
  { id: "db.create", category: "database", label: "Create Tables", description: "Create database tables" },
  { id: "db.edit", category: "database", label: "Edit Tables", description: "Edit table schema" },
  { id: "db.delete", category: "database", label: "Delete Tables", description: "Delete database tables" },
  { id: "org.settings", category: "org", label: "Org Settings", description: "Manage org settings" },
  { id: "roles.manage", category: "org", label: "Manage Roles", description: "Manage roles and permissions" },
  { id: "permissions.manage", category: "org", label: "Manage Permissions", description: "Create/edit app permissions" },
];

// --- Default Roles ---

const DEFAULT_ROLES = [
  {
    name: "Admin",
    description: "Full access to all features",
    is_default: true,
    permissions: SYSTEM_PERMISSIONS.map((p) => p.id),
  },
  {
    name: "Editor",
    description: "Manage data and dashboards",
    is_default: true,
    permissions: [
      "data.ingest", "data.query", "data.export",
      "dashboard.view", "dashboard.create", "dashboard.edit",
      "devices.view", "db.view",
    ],
  },
  {
    name: "Viewer",
    description: "View-only access",
    is_default: true,
    permissions: ["data.query", "dashboard.view", "devices.view", "db.view"],
  },
];

// --- Seed system permissions ---

export async function seedPermissions() {
  for (const p of SYSTEM_PERMISSIONS) {
    await query(
      `INSERT INTO permissions (id, category, label, description, type, org_id)
       VALUES ($1, $2, $3, $4, 'system', NULL)
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description`,
      [p.id, p.category, p.label, p.description]
    );
  }
}

export async function createDefaultRoles(orgId) {
  const roleIds = {};
  for (const role of DEFAULT_ROLES) {
    const result = await query(
      `INSERT INTO roles (org_id, name, description, is_default)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [orgId, role.name, role.description, role.is_default]
    );
    const roleId = result.rows[0].id;
    roleIds[role.name] = roleId;

    for (const permId of role.permissions) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permId]
      );
    }
  }
  return roleIds;
}

// --- Get user's permissions (system + app) ---

export async function getUserPermissions(roleId) {
  if (!roleId) return [];
  const result = await query(
    `SELECT permission_id FROM role_permissions WHERE role_id = $1`,
    [roleId]
  );
  return result.rows.map((r) => r.permission_id);
}

// --- Check permission ---

export async function hasPermission(user, permission) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  if (!user.role_id) return false;
  const perms = await getUserPermissions(user.role_id);
  return perms.includes(permission);
}

// --- Get role IDs ---

export async function getAdminRoleId(orgId) {
  const result = await query(
    "SELECT id FROM roles WHERE org_id = $1 AND name = 'Admin'",
    [orgId]
  );
  return result.rows[0]?.id || null;
}

export async function getDefaultRoleId(orgId, roleName = "Viewer") {
  const result = await query(
    "SELECT id FROM roles WHERE org_id = $1 AND name = $2",
    [orgId, roleName]
  );
  return result.rows[0]?.id || null;
}

// --- App Permissions (org-defined) ---

export async function createAppPermission(orgId, { id, category, label, description }) {
  // Prefix with org slug to avoid collision with system permissions
  const permId = id.includes(".") ? id : `app.${id}`;
  await query(
    `INSERT INTO permissions (id, category, label, description, type, org_id)
     VALUES ($1, $2, $3, $4, 'app', $5)`,
    [permId, category || "custom", label || permId, description || "", orgId]
  );
  return permId;
}

export async function getOrgPermissions(orgId) {
  // Returns system permissions + this org's app permissions
  const result = await query(
    `SELECT id, category, label, description, type, org_id
     FROM permissions
     WHERE org_id IS NULL OR org_id = $1
     ORDER BY type, category, id`,
    [orgId]
  );
  return result.rows;
}

export async function deleteAppPermission(orgId, permId) {
  // Can only delete app permissions belonging to this org
  const result = await query(
    "DELETE FROM permissions WHERE id = $1 AND type = 'app' AND org_id = $2 RETURNING id",
    [permId, orgId]
  );
  return result.rows.length > 0;
}
