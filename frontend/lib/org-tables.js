import { query } from "./db.js";
import crypto from "crypto";

// --- Column type mapping ---

const TYPE_MAP = {
  text: "VARCHAR(500)",
  integer: "INTEGER",
  float: "DOUBLE PRECISION",
  boolean: "BOOLEAN",
  timestamp: "TIMESTAMPTZ",
  json: "JSONB",
};

const VALID_TYPES = Object.keys(TYPE_MAP);

// --- Table name: org-prefixed to prevent collision ---

function realTableName(orgId, tableName) {
  const short = orgId.replace(/-/g, "").slice(0, 8);
  return `org_${short}_${tableName}`;
}

// --- Validate table name ---

function validateTableName(name) {
  if (!name || name.length > 100) return "Table name required (max 100 chars)";
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return "Table name must be lowercase, start with letter, only a-z 0-9 _";
  const reserved = ["users", "organizations", "roles", "permissions", "api_keys", "org_tables", "role_permissions"];
  if (reserved.includes(name)) return `"${name}" is a reserved name`;
  return null;
}

// --- Validate columns ---

function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return "At least one column required";
  if (columns.length > 50) return "Maximum 50 columns";
  for (const col of columns) {
    if (!col.name || !/^[a-z][a-z0-9_]*$/.test(col.name)) return `Invalid column name: "${col.name}"`;
    if (!VALID_TYPES.includes(col.type)) return `Invalid type "${col.type}" for column "${col.name}". Valid: ${VALID_TYPES.join(", ")}`;
  }
  const names = columns.map((c) => c.name);
  if (new Set(names).size !== names.length) return "Duplicate column names";
  return null;
}

// --- Create table ---

export async function createOrgTable(orgId, { name, db_type, columns, description }) {
  const nameErr = validateTableName(name);
  if (nameErr) throw new Error(nameErr);
  const colErr = validateColumns(columns);
  if (colErr) throw new Error(colErr);

  const realName = realTableName(orgId, name);

  // Build CREATE TABLE SQL
  const colDefs = [
    "id BIGSERIAL PRIMARY KEY",
    "org_id UUID NOT NULL",
    "created_at TIMESTAMPTZ DEFAULT NOW()",
  ];
  for (const col of columns) {
    const nullable = col.nullable ? "" : " NOT NULL";
    const def = col.default != null ? ` DEFAULT ${col.default}` : "";
    colDefs.push(`"${col.name}" ${TYPE_MAP[col.type]}${nullable}${def}`);
  }

  // Create real table
  await query(`CREATE TABLE IF NOT EXISTS "${realName}" (${colDefs.join(", ")})`);
  await query(`CREATE INDEX IF NOT EXISTS "idx_${realName}_org" ON "${realName}" (org_id, created_at DESC)`);

  // Grant jupyter_user access to new table
  try {
    await query(`GRANT SELECT, INSERT ON "${realName}" TO jupyter_user`);
  } catch {}

  // Register in org_tables
  const result = await query(
    `INSERT INTO org_tables (org_id, name, db_type, columns, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, name, db_type || "analytical", JSON.stringify(columns), description || ""]
  );

  return result.rows[0];
}

// --- Drop table ---

export async function dropOrgTable(orgId, tableId) {
  const table = await query("SELECT name FROM org_tables WHERE id = $1 AND org_id = $2", [tableId, orgId]);
  if (!table.rows[0]) return false;

  const realName = realTableName(orgId, table.rows[0].name);
  await query(`DROP TABLE IF EXISTS "${realName}"`);
  await query("DELETE FROM org_tables WHERE id = $1", [tableId]);
  return true;
}

// --- List tables ---

export async function listOrgTables(orgId) {
  const result = await query(
    "SELECT * FROM org_tables WHERE org_id = $1 ORDER BY created_at",
    [orgId]
  );
  return result.rows;
}

// --- Insert data ---

export async function insertData(orgId, tableName, rows) {
  const table = await query("SELECT columns FROM org_tables WHERE org_id = $1 AND name = $2", [orgId, tableName]);
  if (!table.rows[0]) throw new Error(`Table "${tableName}" not found`);

  const columns = table.rows[0].columns;
  const colNames = columns.map((c) => c.name);
  const realName = realTableName(orgId, tableName);

  let inserted = 0;
  for (const row of rows) {
    const values = colNames.map((c) => row[c] ?? null);
    const placeholders = colNames.map((_, i) => `$${i + 2}`).join(", ");
    const quotedCols = colNames.map((c) => `"${c}"`).join(", ");

    await query(
      `INSERT INTO "${realName}" (org_id, ${quotedCols}) VALUES ($1, ${placeholders})`,
      [orgId, ...values]
    );
    inserted++;
  }

  // Update row count
  const count = await query(`SELECT COUNT(*) as c FROM "${realName}" WHERE org_id = $1`, [orgId]);
  await query("UPDATE org_tables SET row_count = $1 WHERE org_id = $2 AND name = $3",
    [parseInt(count.rows[0].c), orgId, tableName]);

  return inserted;
}

// --- Query data ---

export async function queryData(orgId, tableName, { limit = 100, offset = 0, order_by, order_dir } = {}) {
  const table = await query("SELECT columns FROM org_tables WHERE org_id = $1 AND name = $2", [orgId, tableName]);
  if (!table.rows[0]) throw new Error(`Table "${tableName}" not found`);

  const realName = realTableName(orgId, tableName);
  const columns = table.rows[0].columns;
  const colNames = columns.map((c) => `"${c.name}"`).join(", ");

  // Validate order_by against actual columns
  let orderClause = "created_at DESC";
  if (order_by) {
    const validCol = columns.find((c) => c.name === order_by);
    if (validCol) {
      const dir = order_dir === "ASC" ? "ASC" : "DESC";
      orderClause = `"${order_by}" ${dir}`;
    }
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 100), 1000);
  const safeOffset = Math.max(0, parseInt(offset) || 0);

  const result = await query(
    `SELECT id, ${colNames}, created_at FROM "${realName}"
     WHERE org_id = $1 ORDER BY ${orderClause} LIMIT $2 OFFSET $3`,
    [orgId, safeLimit, safeOffset]
  );

  return result.rows;
}

// --- API Key management ---

export function generateApiKey() {
  const key = `isk_${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
}

export function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Rate limit defaults per plan
export const PLAN_RATE_LIMITS = {
  free: 100,
  pro: 1000,
  enterprise: 10000,
};
