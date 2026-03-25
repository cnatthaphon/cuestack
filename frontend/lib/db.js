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
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      hashed_password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default pool;
