import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://iot:iot123@db:5432/iotstack",
  max: 10,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function initDB() {
  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  // Organizations
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      slug VARCHAR(50) UNIQUE NOT NULL,
      plan VARCHAR(20) DEFAULT 'free',
      storage_limit_mb INTEGER DEFAULT 1000,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Permissions: system (Aimagin-defined) + app (org-defined)
  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id VARCHAR(100) PRIMARY KEY,
      category VARCHAR(30) NOT NULL,
      label VARCHAR(100),
      description VARCHAR(200),
      type VARCHAR(10) NOT NULL DEFAULT 'system',
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Roles (per org)
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      description VARCHAR(200),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, name)
    )
  `);

  // Role ↔ Permission mapping
  await query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
      permission_id VARCHAR(100) REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    )
  `);

  // Users
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      hashed_password VARCHAR(255) NOT NULL,
      role_id INTEGER REFERENCES roles(id),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      is_super_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(username, org_id)
    )
  `);

  // Org tables registry
  await query(`
    CREATE TABLE IF NOT EXISTS org_tables (
      id SERIAL PRIMARY KEY,
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      db_type VARCHAR(20) NOT NULL DEFAULT 'analytical',
      columns JSONB NOT NULL DEFAULT '[]',
      description VARCHAR(200),
      row_count BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, name)
    )
  `);

  // Org feature entitlements (Super Admin assigns)
  await query(`
    CREATE TABLE IF NOT EXISTS org_features (
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      feature VARCHAR(50) NOT NULL,
      config JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (org_id, feature)
    )
  `);

  // API keys
  await query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      key_hash VARCHAR(255) NOT NULL,
      key_prefix VARCHAR(20) NOT NULL,
      permissions JSONB DEFAULT '[]',
      rate_limit INTEGER,
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);
}

export default pool;
