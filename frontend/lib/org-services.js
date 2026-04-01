import { query } from "./db.js";

export async function listServices(orgId) {
  const result = await query(
    `SELECT s.*, u.username as created_by_name
     FROM org_services s LEFT JOIN users u ON s.created_by = u.id
     WHERE s.org_id = $1 ORDER BY s.created_at DESC`,
    [orgId]
  );
  return result.rows;
}

export async function getService(orgId, serviceId) {
  const result = await query(
    "SELECT * FROM org_services WHERE id = $1 AND org_id = $2",
    [serviceId, orgId]
  );
  return result.rows[0] || null;
}

export async function createService(orgId, { name, description, entrypoint, env }, userId) {
  // Validate name
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
    throw new Error("Service name must be lowercase, start with letter, only a-z 0-9 _ -");
  }
  if (name.length > 100) throw new Error("Name too long (max 100)");
  if (!entrypoint) throw new Error("Entrypoint file required (e.g. main.py)");

  const result = await query(
    `INSERT INTO org_services (org_id, name, description, entrypoint, env, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, name, description || "", entrypoint, JSON.stringify(env || {}), userId]
  );
  return result.rows[0];
}

export async function updateServiceStatus(orgId, serviceId, status, port = null) {
  await query(
    "UPDATE org_services SET status = $1, port = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4",
    [status, port, serviceId, orgId]
  );
}

export async function deleteService(orgId, serviceId) {
  const result = await query(
    "DELETE FROM org_services WHERE id = $1 AND org_id = $2 RETURNING name",
    [serviceId, orgId]
  );
  return result.rows[0] || null;
}
