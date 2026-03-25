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
  // Enable UUID generation
  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  // Organizations — each customer is an org
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

  // Users — belongs to an org (except super_admin)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      hashed_password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'viewer',
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      is_super_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(username, org_id)
    )
  `);
}

export default pool;
