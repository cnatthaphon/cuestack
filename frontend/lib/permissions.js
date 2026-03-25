import { query } from "./db.js";

// --- Default Permissions ---

export const DEFAULT_PERMISSIONS = [
  { id: "users.view", category: "users", description: "View user list" },
  { id: "users.create", category: "users", description: "Create new users" },
  { id: "users.edit", category: "users", description: "Edit user roles/password" },
  { id: "users.delete", category: "users", description: "Delete users" },
  { id: "data.ingest", category: "data", description: "Send data to pipeline" },
  { id: "data.query", category: "data", description: "Query data" },
  { id: "data.export", category: "data", description: "Export data as CSV" },
  { id: "dashboard.view", category: "dashboard", description: "View dashboards" },
  { id: "dashboard.create", category: "dashboard", description: "Create dashboards" },
  { id: "dashboard.edit", category: "dashboard", description: "Edit dashboards" },
  { id: "dashboard.publish", category: "dashboard", description: "Publish dashboards" },
  { id: "devices.view", category: "devices", description: "View device list" },
  { id: "devices.create", category: "devices", description: "Register devices" },
  { id: "devices.edit", category: "devices", description: "Edit device config" },
  { id: "devices.delete", category: "devices", description: "Remove devices" },
  { id: "org.settings", category: "org", description: "Manage org settings" },
  { id: "roles.manage", category: "org", description: "Manage roles and permissions" },
];

// --- Default Roles (created per org) ---

const DEFAULT_ROLES = [
  {
    name: "Admin",
    description: "Full access to all features",
    is_default: true,
    permissions: DEFAULT_PERMISSIONS.map((p) => p.id), // all
  },
  {
    name: "Editor",
    description: "Manage data and dashboards",
    is_default: true,
    permissions: [
      "data.ingest", "data.query", "data.export",
      "dashboard.view", "dashboard.create", "dashboard.edit",
      "devices.view",
    ],
  },
  {
    name: "Viewer",
    description: "View-only access",
    is_default: true,
    permissions: ["data.query", "dashboard.view", "devices.view"],
  },
];

// --- Seed permissions + create default roles for an org ---

export async function seedPermissions() {
  for (const p of DEFAULT_PERMISSIONS) {
    await query(
      `INSERT INTO permissions (id, category, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.category, p.description]
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

    // Assign permissions
    for (const permId of role.permissions) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permId]
      );
    }
  }
  return roleIds;
}

// --- Get user's permissions ---

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
  if (user.is_super_admin) return true; // super admin can do everything
  if (!user.role_id) return false;

  const perms = await getUserPermissions(user.role_id);
  return perms.includes(permission);
}

// --- Get role's admin ID for an org ---

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
