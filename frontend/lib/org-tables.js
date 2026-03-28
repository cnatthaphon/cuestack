import { query } from "./db.js";
import crypto from "crypto";

// --- Column type mapping ---

const TYPE_MAP = {
  text: "VARCHAR(500)",
  long_text: "TEXT",
  integer: "INTEGER",
  bigint: "BIGINT",
  float: "DOUBLE PRECISION",
  boolean: "BOOLEAN",
  timestamp: "TIMESTAMPTZ",
  date: "DATE",
  json: "JSONB",
  uuid: "UUID",
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
  const postConstraints = [];
  const indexCols = [];

  for (const col of columns) {
    let def = `"${col.name}" ${TYPE_MAP[col.type]}`;
    if (!col.nullable) def += " NOT NULL";
    if (col.unique) def += " UNIQUE";
    if (col.default_value != null && col.default_value !== "") {
      // Sanitize default — only allow safe literals
      const dv = col.default_value;
      if (col.type === "boolean") {
        def += ` DEFAULT ${dv === "true" || dv === true ? "TRUE" : "FALSE"}`;
      } else if (["integer", "bigint", "float"].includes(col.type)) {
        def += ` DEFAULT ${parseFloat(dv) || 0}`;
      } else if (col.type === "timestamp" || col.type === "date") {
        if (dv === "now" || dv === "NOW()") def += " DEFAULT NOW()";
      } else {
        def += ` DEFAULT '${String(dv).replace(/'/g, "''")}'`;
      }
    }
    colDefs.push(def);
    if (col.indexed) indexCols.push(col.name);
  }

  // Create real table
  await query(`CREATE TABLE IF NOT EXISTS "${realName}" (${colDefs.join(", ")})`);
  await query(`CREATE INDEX IF NOT EXISTS "idx_${realName}_org" ON "${realName}" (org_id, created_at DESC)`);

  // Create indexes for columns marked as indexed
  for (const colName of indexCols) {
    await query(`CREATE INDEX IF NOT EXISTS "idx_${realName}_${colName}" ON "${realName}" ("${colName}")`);
  }

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

// --- Advanced query (server-side filter/sort/paginate → SQL) ---

const FILTER_OPS = {
  "eq": "=", "neq": "!=", "gt": ">", "lt": "<", "gte": ">=", "lte": "<=",
  "contains": "ILIKE", "starts": "ILIKE", "ends": "ILIKE",
  "null": "IS NULL", "notnull": "IS NOT NULL",
};

export async function queryDataAdvanced(orgId, tableName, { limit = 50, offset = 0, order_by, order_dir, filters = [] } = {}) {
  const table = await query("SELECT columns FROM org_tables WHERE org_id = $1 AND name = $2", [orgId, tableName]);
  if (!table.rows[0]) throw new Error(`Table "${tableName}" not found`);

  const realName = realTableName(orgId, tableName);
  const columns = table.rows[0].columns;
  const validCols = new Set(["id", "created_at", ...columns.map((c) => c.name)]);
  const colNames = columns.map((c) => `"${c.name}"`).join(", ");

  // Build WHERE clauses from filters (parameterized — no SQL injection)
  const whereParts = ["org_id = $1"];
  const params = [orgId];
  let pi = 2;

  for (const f of filters) {
    if (!f.column || !validCols.has(f.column)) continue;
    const op = FILTER_OPS[f.op] || "=";
    const col = `"${f.column}"`;

    if (f.op === "null") { whereParts.push(`${col} IS NULL`); continue; }
    if (f.op === "notnull") { whereParts.push(`${col} IS NOT NULL`); continue; }
    if (f.op === "contains") { whereParts.push(`${col}::text ILIKE $${pi}`); params.push(`%${f.value}%`); pi++; continue; }
    if (f.op === "starts") { whereParts.push(`${col}::text ILIKE $${pi}`); params.push(`${f.value}%`); pi++; continue; }
    if (f.op === "ends") { whereParts.push(`${col}::text ILIKE $${pi}`); params.push(`%${f.value}`); pi++; continue; }

    whereParts.push(`${col} ${op} $${pi}`);
    params.push(f.value);
    pi++;
  }

  const whereSQL = whereParts.join(" AND ");

  // Order
  let orderSQL = "created_at DESC";
  if (order_by && validCols.has(order_by)) {
    orderSQL = `"${order_by}" ${order_dir === "ASC" ? "ASC" : "DESC"} NULLS LAST`;
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 1000);
  const safeOffset = Math.max(0, parseInt(offset) || 0);

  // Count total (for pagination)
  const countResult = await query(`SELECT COUNT(*) as total FROM "${realName}" WHERE ${whereSQL}`, params);
  const total = parseInt(countResult.rows[0].total);

  // Fetch page
  const dataResult = await query(
    `SELECT id, ${colNames}, created_at FROM "${realName}" WHERE ${whereSQL} ORDER BY ${orderSQL} LIMIT $${pi} OFFSET $${pi + 1}`,
    [...params, safeLimit, safeOffset]
  );

  return { rows: dataResult.rows, total, limit: safeLimit, offset: safeOffset };
}

// --- Update record ---

export async function updateRecord(orgId, tableName, recordId, data) {
  const table = await query("SELECT columns FROM org_tables WHERE org_id = $1 AND name = $2", [orgId, tableName]);
  if (!table.rows[0]) throw new Error(`Table "${tableName}" not found`);

  const realName = realTableName(orgId, tableName);
  const columns = table.rows[0].columns;
  const validCols = new Set(columns.map((c) => c.name));

  const updates = [];
  const params = [recordId, orgId];
  let pi = 3;

  for (const [key, value] of Object.entries(data)) {
    if (!validCols.has(key)) continue;
    updates.push(`"${key}" = $${pi}`);
    params.push(value);
    pi++;
  }

  if (updates.length === 0) throw new Error("No valid columns to update");

  await query(`UPDATE "${realName}" SET ${updates.join(", ")} WHERE id = $1 AND org_id = $2`, params);
  return true;
}

// --- Delete records ---

export async function deleteRecords(orgId, tableName, recordIds) {
  const table = await query("SELECT name FROM org_tables WHERE org_id = $1 AND name = $2", [orgId, tableName]);
  if (!table.rows[0]) throw new Error(`Table "${tableName}" not found`);

  const realName = realTableName(orgId, tableName);
  const ids = Array.isArray(recordIds) ? recordIds : [recordIds];

  const result = await query(
    `DELETE FROM "${realName}" WHERE org_id = $1 AND id = ANY($2::bigint[])`,
    [orgId, ids]
  );
  return result.rowCount;
}

// --- Get table info by ID ---

export async function getTableById(orgId, tableId) {
  const result = await query("SELECT * FROM org_tables WHERE id = $1 AND org_id = $2", [tableId, orgId]);
  return result.rows[0] || null;
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
