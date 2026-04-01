import { query } from "./db.js";

// Internal config store — orgs never access this directly.
// Used by the platform to store: app configs, service configs,
// notebook preferences, dashboard layouts, deployment settings, etc.

export async function getConfig(orgId, category, key) {
  const result = await query(
    "SELECT value FROM org_configs WHERE org_id = $1 AND category = $2 AND key = $3",
    [orgId, category, key]
  );
  return result.rows[0]?.value || null;
}

export async function setConfig(orgId, category, key, value) {
  await query(
    `INSERT INTO org_configs (org_id, category, key, value, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (org_id, category, key)
     DO UPDATE SET value = $4, updated_at = NOW()`,
    [orgId, category, key, JSON.stringify(value)]
  );
}

export async function getConfigsByCategory(orgId, category) {
  const result = await query(
    "SELECT key, value, updated_at FROM org_configs WHERE org_id = $1 AND category = $2 ORDER BY key",
    [orgId, category]
  );
  return result.rows;
}

export async function deleteConfig(orgId, category, key) {
  await query(
    "DELETE FROM org_configs WHERE org_id = $1 AND category = $2 AND key = $3",
    [orgId, category, key]
  );
}

export async function getAllConfigs(orgId) {
  const result = await query(
    "SELECT category, key, value, updated_at FROM org_configs WHERE org_id = $1 ORDER BY category, key",
    [orgId]
  );
  return result.rows;
}
