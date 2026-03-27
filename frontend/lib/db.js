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

  // Virtual file system — metadata in DB, physical files stored flat
  await query(`
    CREATE TABLE IF NOT EXISTS org_file_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      parent_id UUID REFERENCES org_file_entries(id) ON DELETE CASCADE,
      entry_type VARCHAR(10) NOT NULL DEFAULT 'file',
      storage_key VARCHAR(255),
      size BIGINT DEFAULT 0,
      mime_type VARCHAR(100),
      is_public BOOLEAN DEFAULT false,
      shared_with JSONB DEFAULT '[]',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE org_file_entries ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) DEFAULT 'private'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_file_entries_parent ON org_file_entries (org_id, parent_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_file_entries_name ON org_file_entries (org_id, parent_id, name)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_file_entries_owner ON org_file_entries (org_id, created_by)`);

  // Unified pages — all user content in one tree (like Google Drive)
  // page_type: dashboard, html, visual, notebook
  // entry_type: folder, page
  await query(`
    CREATE TABLE IF NOT EXISTS user_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100),
      icon VARCHAR(10) DEFAULT '\u{1F4CA}',
      page_type VARCHAR(20) NOT NULL DEFAULT 'dashboard',
      entry_type VARCHAR(10) NOT NULL DEFAULT 'page',
      parent_id UUID REFERENCES user_pages(id) ON DELETE SET NULL,
      config JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'draft',
      visibility VARCHAR(10) DEFAULT 'private',
      shared_with JSONB DEFAULT '[]',
      permission_id VARCHAR(100),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_pages_user ON user_pages (org_id, user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_pages_parent ON user_pages (user_id, parent_id)`);

  // User profile fields
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(50)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS landing_page VARCHAR(200)`);

  // User ↔ Roles (many-to-many) — supplements legacy role_id
  await query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    )
  `);

  // Notifications
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      message TEXT,
      type VARCHAR(20) DEFAULT 'info',
      source VARCHAR(100),
      link VARCHAR(500),
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC)`);

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

  // Dashboards
  await query(`
    CREATE TABLE IF NOT EXISTS org_dashboards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      description VARCHAR(500),
      widgets JSONB DEFAULT '[]',
      layout JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'draft',
      permission_id VARCHAR(100),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, slug)
    )
  `);

  // Nav group columns for apps and dashboards
  await query(`ALTER TABLE org_dashboards ADD COLUMN IF NOT EXISTS nav_group VARCHAR(50) DEFAULT ''`);
  await query(`ALTER TABLE org_dashboards ADD COLUMN IF NOT EXISTS nav_order INTEGER DEFAULT 0`);
  await query(`ALTER TABLE org_apps ADD COLUMN IF NOT EXISTS nav_group VARCHAR(50) DEFAULT ''`);
  await query(`ALTER TABLE org_apps ADD COLUMN IF NOT EXISTS nav_order INTEGER DEFAULT 0`);
  await query(`ALTER TABLE org_apps ADD COLUMN IF NOT EXISTS required_permissions JSONB DEFAULT '[]'`);
  await query(`ALTER TABLE org_dashboards ADD COLUMN IF NOT EXISTS required_permissions JSONB DEFAULT '[]'`);

  // Nav groups — org-defined categories for published content
  await query(`
    CREATE TABLE IF NOT EXISTS org_nav_groups (
      id SERIAL PRIMARY KEY,
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      icon VARCHAR(10) DEFAULT '',
      sort_order INTEGER DEFAULT 0,
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

  // Org apps (user-built apps — HTML/JS, Dash, Visual)
  await query(`
    CREATE TABLE IF NOT EXISTS org_apps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      description VARCHAR(500),
      app_type VARCHAR(20) NOT NULL DEFAULT 'html',
      icon VARCHAR(10) DEFAULT '\u{1F4F1}',
      entrypoint VARCHAR(200) DEFAULT 'index.html',
      config JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'draft',
      permission_id VARCHAR(100),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, slug)
    )
  `);

  // Python services registry
  await query(`
    CREATE TABLE IF NOT EXISTS org_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500),
      entrypoint VARCHAR(200) NOT NULL,
      status VARCHAR(20) DEFAULT 'stopped',
      port INTEGER,
      env JSONB DEFAULT '{}',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, name)
    )
  `);

  // Org config store (internal — not exposed to org users)
  await query(`
    CREATE TABLE IF NOT EXISTS org_configs (
      id SERIAL PRIMARY KEY,
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      category VARCHAR(50) NOT NULL,
      key VARCHAR(100) NOT NULL,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, category, key)
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

// Create restricted user for Jupyter notebooks
// Can only SELECT org data tables (org_*), org_tables metadata.
// Cannot access: users, organizations, api_keys, org_configs, permissions, roles, role_permissions
export async function initJupyterUser() {
  const jupyterPass = process.env.JUPYTER_DB_PASSWORD || "jupyter_readonly_123";
  try {
    // Create user if not exists
    const check = await query("SELECT 1 FROM pg_roles WHERE rolname = 'jupyter_user'");
    if (check.rows.length === 0) {
      await query(`CREATE USER jupyter_user WITH PASSWORD '${jupyterPass}'`);
    }
    // Revoke all defaults, then grant selective access only
    await query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM jupyter_user");
    await query("REVOKE ALL ON SCHEMA public FROM jupyter_user");
    await query("GRANT USAGE ON SCHEMA public TO jupyter_user");
    // Revoke default public schema privileges that PostgreSQL grants to all users
    await query("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC");
    // Explicitly block system tables (catches PUBLIC role grants)
    const systemTables = ["organizations", "users", "permissions", "roles", "role_permissions",
      "api_keys", "org_configs", "org_features", "org_services", "org_apps", "org_dashboards"];
    for (const t of systemTables) {
      try { await query(`REVOKE ALL ON ${t} FROM jupyter_user`); } catch {}
      try { await query(`REVOKE ALL ON ${t} FROM PUBLIC`); } catch {}
    }
    // Allow reading org_tables registry (to list tables, not configs)
    await query("GRANT SELECT ON org_tables TO jupyter_user");
    // Allow read/write on org data tables (org_* prefix)
    // This uses a function to grant on existing + will be called on new table creation
    const orgTables = await query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'org_%' AND tablename != 'org_tables' AND tablename != 'org_features' AND tablename != 'org_configs'"
    );
    for (const row of orgTables.rows) {
      await query(`GRANT SELECT, INSERT ON "${row.tablename}" TO jupyter_user`);
    }
    // Allow sequences for inserts
    await query("GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO jupyter_user");
  } catch (e) {
    // Non-fatal — might not have superuser privileges
    console.error("Jupyter user setup:", e.message);
  }
}

export default pool;
