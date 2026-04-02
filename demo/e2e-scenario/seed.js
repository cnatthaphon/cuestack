/**
 * E2E Demo Scenario Seeder
 *
 * Seeds the demo pages, tables, and channels into PostgreSQL.
 * Run after: docker compose up -d && initial setup
 *
 * Usage: node demo/e2e-scenario/seed.js
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_URL = process.env.DATABASE_URL || "postgresql://iot:iot123@localhost:5432/iotstack";

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // Get first org and admin user
    const org = await client.query("SELECT id FROM organizations LIMIT 1");
    const user = await client.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");

    if (!org.rows[0] || !user.rows[0]) {
      console.error("No org or admin user found. Run initial setup first.");
      process.exit(1);
    }

    const orgId = org.rows[0].id;
    const userId = user.rows[0].id;

    console.log(`Org: ${orgId}, User: ${userId}`);

    // 1. Create channels
    for (const ch of ["sensor-room-a", "sensor-room-b"]) {
      await client.query(
        `INSERT INTO org_channels (org_id, name, description, channel_type)
         VALUES ($1, $2, $3, 'data') ON CONFLICT (org_id, name) DO NOTHING`,
        [orgId, ch, `Temperature & humidity sensor: ${ch}`]
      );
      console.log(`Channel: ${ch}`);
    }

    // 2. Create tables registry
    for (const t of [
      { name: "raw_sensor_data", desc: "Raw temperature and humidity from MQTT",
        cols: [
          {name:"timestamp",type:"DateTime64(3)"},
          {name:"channel",type:"String"},
          {name:"temperature",type:"Float64"},
          {name:"humidity",type:"Float64"}
        ]},
      { name: "processed_sensor_data", desc: "FFT and smoothed values",
        cols: [
          {name:"timestamp",type:"DateTime64(3)"},
          {name:"channel",type:"String"},
          {name:"metric",type:"String"},
          {name:"value",type:"Float64"}
        ]},
    ]) {
      await client.query(
        `INSERT INTO org_tables (org_id, name, db_type, columns, description)
         VALUES ($1, $2, 'analytical', $3, $4) ON CONFLICT (org_id, name) DO NOTHING`,
        [orgId, t.name, JSON.stringify(t.cols), t.desc]
      );
      console.log(`Table: ${t.name}`);
    }

    // 3. Create demo folder
    const folder = await client.query(
      `INSERT INTO user_pages (org_id, user_id, name, icon, page_type, entry_type, sort_order)
       VALUES ($1, $2, 'E2E Demo', '🧪', 'dashboard', 'folder', 0)
       ON CONFLICT DO NOTHING RETURNING id`,
      [orgId, userId]
    );
    const folderId = folder.rows[0]?.id ||
      (await client.query("SELECT id FROM user_pages WHERE name = 'E2E Demo' AND org_id = $1", [orgId])).rows[0]?.id;

    // 4. Create pages from JSON configs
    const pages = [
      { file: "page-simulator.json", sort: 1 },
      { file: "page-etl-service.json", sort: 2 },
      { file: "page-dashboard.json", sort: 3 },
    ];

    for (const p of pages) {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, p.file), "utf8"));
      await client.query(
        `INSERT INTO user_pages (org_id, user_id, name, icon, page_type, entry_type, parent_id, config, sort_order)
         VALUES ($1, $2, $3, $4, $5, 'page', $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [orgId, userId, config.name, config.icon, config.page_type, folderId, JSON.stringify(config.config), p.sort]
      );
      console.log(`Page: ${config.name}`);
    }

    console.log("\nDemo scenario seeded successfully!");
    console.log("Open the workspace → E2E Demo folder to see the pages.");

  } finally {
    await client.end();
  }
}

seed().catch(console.error);
