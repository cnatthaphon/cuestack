/**
 * E2E Demo Scenario Seeder — via API calls
 *
 * Uses the same API endpoints that a real user would use.
 * This tests the API while setting up the demo.
 *
 * Prerequisites:
 *   docker compose up -d
 *   curl http://localhost:8080/api/init   (creates tables + super admin)
 *
 * Usage: node demo/e2e-scenario/seed.js
 *
 * Login after: org = acme, username = cue, password = admin123
 */

const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8080";
let cookie = "";

// --- HTTP helpers ---

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: res.headers.get("set-cookie") };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// --- Steps ---

async function login(username, password, orgSlug) {
  const body = { username, password };
  if (orgSlug) body.org_slug = orgSlug;
  const res = await post("/api/auth/login", body);
  if (res.status !== 200) {
    console.error(`Login failed (${res.status}):`, res.data);
    return false;
  }
  if (res.cookie) cookie = res.cookie.split(";")[0];
  console.log(`✅ Logged in as ${username}${orgSlug ? ` (org: ${orgSlug})` : " (super admin)"}`);
  return res.data;
}

async function getOrgs() {
  const res = await get("/api/super/orgs");
  return res.data.orgs || res.data || [];
}

async function createUserInOrg(orgId, username, password, role) {
  const res = await post(`/api/super/orgs/${orgId}/users`, { username, password, role });
  if (res.status === 201) {
    console.log(`✅ Created user: ${username} (role: ${role})`);
    return res.data.user;
  } else if (res.status === 409) {
    console.log(`⏭️  User '${username}' already exists`);
    return { username };
  } else {
    console.error(`❌ Create user failed (${res.status}):`, res.data);
    return null;
  }
}

async function createChannel(name, description) {
  const res = await post("/api/channels", { name, description });
  if (res.status === 200 || res.status === 201) {
    console.log(`✅ Channel: ${name}`);
    return res.data;
  } else if (res.data?.error?.includes("exists") || res.status === 409) {
    console.log(`⏭️  Channel '${name}' already exists`);
    return { name };
  } else {
    console.error(`❌ Create channel failed (${res.status}):`, res.data);
    return null;
  }
}

async function createTable(name, columns, description) {
  const res = await post("/api/tables", { name, columns, description, db_type: "analytical" });
  if (res.status === 200 || res.status === 201) {
    console.log(`✅ Table: ${name}`);
    return res.data;
  } else if (res.data?.error?.includes("exists") || res.status === 409) {
    console.log(`⏭️  Table '${name}' already exists`);
    return { name };
  } else {
    console.error(`❌ Create table failed (${res.status}):`, res.data);
    return null;
  }
}

async function createPage(name, icon, pageType, config, parentId) {
  // Check if page already exists in this folder
  const existingPages = await get("/api/pages");
  const all = existingPages.data?.pages || existingPages.data || [];
  const existing = all.find(p => p.name === name && p.parent_id === parentId);

  let pageId;
  if (existing) {
    pageId = existing.id;
    // Update config if it changed
    if (config && Object.keys(config).length > 0) {
      await patch(`/api/pages/${pageId}`, { config });
      console.log(`⏭️  Page '${name}' exists — config updated`);
    } else {
      console.log(`⏭️  Page '${name}' already exists`);
    }
    return { id: pageId };
  }

  // Create new page
  const body = { name, icon, page_type: pageType };
  if (parentId) body.parent_id = parentId;
  const res = await post("/api/pages", body);

  if (res.status === 200 || res.status === 201) {
    pageId = res.data?.page?.id || res.data?.id;
  } else {
    console.error(`❌ Create page failed (${res.status}):`, res.data);
    return null;
  }

  // Step 2: Update with real config (same as editing in UI)
  if (pageId && config && Object.keys(config).length > 0) {
    const patchRes = await patch(`/api/pages/${pageId}`, { config });
    if (patchRes.status === 200) {
      console.log(`✅ Page: ${name} (${pageType}) — config saved`);
    } else {
      console.error(`❌ Page config update failed (${patchRes.status}):`, patchRes.data);
    }
  } else {
    console.log(`✅ Page: ${name} (${pageType})`);
  }

  return { id: pageId, ...res.data };
}

// --- Main ---

async function seed() {
  console.log("=== CueStack E2E Demo Seeder (via API) ===\n");

  // Step 1: Init (ensure tables + super admin exist)
  console.log("Step 1: Initialize...");
  await get("/api/init");
  console.log("✅ Init complete\n");

  // Step 2: Login as super admin
  console.log("Step 2: Login as super admin...");
  const superLogin = await login("admin", "admin");
  if (!superLogin) process.exit(1);
  console.log();

  // Step 3: Get acme org ID
  console.log("Step 3: Find acme org...");
  const orgs = await getOrgs();
  const acme = orgs.find((o) => o.slug === "acme");
  if (!acme) {
    console.error("❌ Aimagin org not found. Check init.");
    process.exit(1);
  }
  console.log(`✅ Found org: ${acme.name} (${acme.id})\n`);

  // Step 4: Create org user
  console.log("Step 4: Create org user...");
  await createUserInOrg(acme.id, "cue", "admin123", "Admin");
  console.log();

  // Step 5: Login as org user
  console.log("Step 5: Login as org user...");
  const orgLogin = await login("cue", "admin123", "acme");
  if (!orgLogin) process.exit(1);
  console.log();

  // Step 6: Create channels
  console.log("Step 6: Create channels...");
  await createChannel("sensor-room-a", "Temperature & humidity sensor in Room A");
  await createChannel("sensor-room-b", "Temperature & humidity sensor in Room B");

  // Step 6b: Create channel token for device access (MQTT + WebSocket)
  console.log("Step 6b: Create device token...");
  let deviceToken = "";
  const tokenRes = await post("/api/channels", {
    action: "create_token",
    name: "Demo Sensor Device",
    permissions: ["publish", "subscribe"],
  });
  if (tokenRes.status === 201) {
    deviceToken = tokenRes.data.token;
    const orgShort = acme.id.replace(/-/g, "").slice(0, 8);
    console.log(`✅ Device token: ${deviceToken}`);
    console.log(`   Topics: org/${orgShort}/sensor-room-a, org/${orgShort}/sensor-room-b`);
  } else {
    console.log(`⏭️  Token creation skipped (may already exist)`);
    console.log(`   If simulator can't connect, create a new token in Channels → Credentials`);
  }
  console.log();

  // Step 7: Create tables
  console.log("Step 7: Create tables...");
  await createTable("raw_sensor_data", [
    { name: "timestamp", type: "timestamp" },
    { name: "channel", type: "text" },
    { name: "temperature", type: "float" },
    { name: "humidity", type: "float" },
  ], "Raw temperature and humidity from MQTT sensors");

  await createTable("processed_sensor_data", [
    { name: "timestamp", type: "timestamp" },
    { name: "channel", type: "text" },
    { name: "metric", type: "text" },
    { name: "value", type: "float" },
  ], "FFT frequencies and smoothed values");

  await createTable("highfreq_sensor", [
    { name: "timestamp", type: "timestamp" },
    { name: "value", type: "float" },
    { name: "signal_b", type: "float" },
  ], "High-frequency sensor data (1s intervals) — LTTB demo");

  await createTable("energy_predictions", [
    { name: "formula", type: "text" },
    { name: "inputs", type: "json" },
    { name: "energy_kwh", type: "float" },
    { name: "cost_thb", type: "float" },
    { name: "pulldown_min", type: "float" },
    { name: "recommendation", type: "text" },
    { name: "computed_at", type: "timestamp" },
  ], "Energy model predictions — persisted for other widgets and pipelines");

  await createTable("power_consumption", [
    { name: "timestamp", type: "timestamp" },
    { name: "power_w", type: "float" },
    { name: "temp_int", type: "float" },
    { name: "temp_ext", type: "float" },
    { name: "state", type: "text" },
  ], "AC power consumption — simulated by notebook, consumed by EI widget");

  await createTable("ei_models", [
    { name: "model_id", type: "text" },
    { name: "name", type: "text" },
    { name: "model_type", type: "text" },
    { name: "params", type: "json" },
    { name: "accuracy", type: "json" },
    { name: "is_active", type: "boolean" },
    { name: "trained_at", type: "timestamp" },
    { name: "training_days", type: "integer" },
  ], "ML models for energy prediction — trained by notebook");

  await createTable("ei_daily_stats", [
    { name: "date", type: "text" },
    { name: "model_id", type: "text" },
    { name: "actual_kwh", type: "float" },
    { name: "predicted_kwh", type: "float" },
    { name: "savings_kwh", type: "float" },
    { name: "savings_pct", type: "float" },
    { name: "peak_kw", type: "float" },
    { name: "operating_hours", type: "float" },
    { name: "avg_te", type: "float" },
    { name: "time_bin", type: "text" },
    { name: "power_bin", type: "text" },
    { name: "badges", type: "json" },
    { name: "status", type: "text" },
  ], "Daily energy stats — actual vs predicted with badges");

  await createTable("ei_cache", [
    { name: "cache_key", type: "text" },
    { name: "result", type: "json" },
    { name: "computed_at", type: "timestamp" },
    { name: "ttl_seconds", type: "integer" },
  ], "Analysis cache — precomputed results for fast page loads");

  await createTable("ei_alerts", [
    { name: "alert_type", type: "text" },
    { name: "severity", type: "text" },
    { name: "message", type: "text" },
    { name: "value", type: "float" },
    { name: "threshold", type: "float" },
    { name: "acknowledged", type: "boolean" },
    { name: "fired_at", type: "timestamp" },
  ], "Energy alerts — threshold violations, peak warnings");
  console.log();

  // Step 8: Create demo folder
  console.log("Step 8: Create demo pages...");
  // Check if folder already exists
  const existingPages = await get("/api/pages");
  const allPages = existingPages.data?.pages || existingPages.data || [];
  const existingFolder = allPages.find(p => p.name === "E2E Demo" && p.entry_type === "folder");

  let folderId;
  if (existingFolder) {
    folderId = existingFolder.id;
    console.log(`⏭️  Folder 'E2E Demo' already exists (${folderId})`);
  } else {
    const folderRes = await post("/api/pages", {
      name: "E2E Demo", icon: "🧪", page_type: "dashboard", entry_type: "folder", config: {},
    });
    folderId = folderRes.data?.id || folderRes.data?.page?.id;
    console.log(`✅ Folder: E2E Demo`);
  }

  // Step 9: Create pages from JSON configs
  // All page-*.json files in this directory are auto-loaded
  const pageFiles = fs.readdirSync(__dirname)
    .filter(f => f.startsWith("page-") && f.endsWith(".json"))
    .sort();
  const pages = pageFiles.map((file, i) => ({ file, sort: i + 1 }));

  for (const p of pages) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, p.file), "utf8"));
    await createPage(raw.name, raw.icon, raw.page_type, raw.config, folderId);
  }

  // Step 10: Seed sample sensor data into ClickHouse + Postgres table
  console.log("\nStep 10: Seed sample sensor data...");
  const now = Date.now();
  let inserted = 0;
  const tableRows = []; // batch for Postgres table

  for (let i = 0; i < 200; i++) {
    const ts = new Date(now - (200 - i) * 15000); // every 15s going back ~50min
    const baseTemp = 24 + Math.sin(i * 0.05) * 3;
    const baseHumid = 55 + Math.cos(i * 0.03) * 10;

    for (const channel of ["sensor-room-a", "sensor-room-b"]) {
      const offset = channel === "sensor-room-b" ? 2 : 0;
      const temp = +(baseTemp + offset + (Math.random() - 0.5) * 1.5).toFixed(2);
      const humid = +(baseHumid - offset + (Math.random() - 0.5) * 3).toFixed(2);

      const res = await post("/api/v1/data/events", {
        channel,
        source: "seed",
        payload: { temperature: temp, humidity: humid, timestamp: ts.toISOString() },
      });
      if (res.status === 200) inserted++;

      tableRows.push({ timestamp: ts.toISOString(), channel, temperature: temp, humidity: humid });
    }
  }
  console.log(`✅ Inserted ${inserted} sensor events into ClickHouse`);

  // Also seed into Postgres org table for dashboard chart widgets
  console.log("  Seeding raw_sensor_data table for chart widgets...");
  // Look up table ID by name
  const tablesRes = await get("/api/tables");
  const allTables = tablesRes.data?.tables || tablesRes.data || [];
  const rawTable = allTables.find(t => t.name === "raw_sensor_data");
  let tableInserted = 0;
  if (rawTable) {
    // Check if already has data (skip if re-seeding)
    const checkRes = await get(`/api/tables/${rawTable.id}/data?limit=1`);
    const existingRows = checkRes.data?.total || checkRes.data?.rows?.length || 0;
    if (existingRows > 0) {
      console.log(`⏭️  raw_sensor_data already has ${existingRows} rows — skipping`);
    } else {
      // Insert in batches of 20
      for (let i = 0; i < tableRows.length; i += 20) {
        const batch = tableRows.slice(i, i + 20);
        const res = await post(`/api/tables/${rawTable.id}/data`, { rows: batch });
        if (res.status === 200 || res.status === 201) tableInserted += batch.length;
      }
      console.log(`✅ Inserted ${tableInserted} rows into raw_sensor_data table`);
    }
  } else {
    console.log("⚠️  raw_sensor_data table not found — skipping table seed");
  }

  // Step 11: Seed simulated AC power consumption data (7 days)
  console.log("\nStep 11: Seed AC power consumption data...");
  const powerTable = allTables.find(t => t.name === "power_consumption");
  if (powerTable) {
    const checkPower = await get(`/api/tables/${powerTable.id}/data?limit=1`);
    const existingPower = checkPower.data?.total || checkPower.data?.rows?.length || 0;
    if (existingPower > 0) {
      console.log(`⏭️  power_consumption already has ${existingPower} rows — skipping`);
    } else {
      // Simulate 7 days of AC operation: 15-min intervals
      // Daily pattern: OFF overnight (0-8), pulldown (8-10), cycling (10-21), ramp-down (21-22), OFF (22-24)
      const powerRows = [];
      const DAYS = 7;
      const baseDate = new Date(now - DAYS * 24 * 3600 * 1000);

      for (let day = 0; day < DAYS; day++) {
        const dayStart = new Date(baseDate.getTime() + day * 24 * 3600 * 1000);
        const dayNoise = (Math.random() - 0.5) * 0.2; // ±10% daily variation
        const Te_day = 29 + Math.sin(day * 0.9) * 3 + (Math.random() - 0.5) * 2; // outdoor temp varies

        for (let h = 0; h < 24; h++) {
          for (let m = 0; m < 60; m += 15) {
            const ts = new Date(dayStart.getTime() + h * 3600000 + m * 60000);
            const hourFrac = h + m / 60;
            let power_w, temp_int, state;
            const Te = Te_day + Math.sin(hourFrac / 24 * Math.PI * 2 - 1) * 2; // diurnal outdoor cycle

            if (hourFrac < 8 || hourFrac >= 22) {
              // OFF — room warms toward outdoor
              state = "OFF";
              power_w = 5 + Math.random() * 10; // standby
              const offHours = hourFrac < 8 ? (hourFrac + 2) : (hourFrac - 22); // hours since shutdown
              temp_int = Te - (Te - 24) * Math.exp(-0.3 * offHours); // warmup toward Te
            } else if (hourFrac < 10) {
              // PULLDOWN — high power, temp dropping
              state = "PULLDOWN";
              const pullProgress = (hourFrac - 8) / 2; // 0→1 over 2 hours
              power_w = 800 + (1 - pullProgress) * 600 + Math.random() * 100; // starts ~1400W, drops to ~800W
              temp_int = 30 - pullProgress * 6; // 30→24°C
            } else if (hourFrac < 21) {
              // CYCLING — steady power, maintaining setpoint
              state = "CYCLING";
              const cycleBase = 400 + (Te - 24) * 48 + 98; // k_leak*(Te-setpoint) + k_base
              power_w = cycleBase * (1 + dayNoise) + (Math.random() - 0.5) * 80;
              temp_int = 24 + (Math.random() - 0.5) * 0.8; // ±0.4°C around setpoint
            } else {
              // RAMP DOWN (21-22)
              state = "CYCLING";
              const rampProgress = (hourFrac - 21);
              power_w = (400 + (Te - 24) * 48 + 98) * (1 - rampProgress * 0.5) + Math.random() * 50;
              temp_int = 24 + rampProgress * 1.5;
            }

            power_w = Math.max(0, +(power_w).toFixed(1));
            temp_int = +(temp_int + (Math.random() - 0.5) * 0.3).toFixed(2);

            powerRows.push({
              timestamp: ts.toISOString(),
              power_w,
              temp_int,
              temp_ext: +(Te + (Math.random() - 0.5) * 0.5).toFixed(2),
              state,
            });
          }
        }
      }

      // Insert in batches
      let powerInserted = 0;
      for (let i = 0; i < powerRows.length; i += 20) {
        const batch = powerRows.slice(i, i + 20);
        const res = await post(`/api/tables/${powerTable.id}/data`, { rows: batch });
        if (res.status === 200 || res.status === 201) powerInserted += batch.length;
      }
      console.log(`✅ Inserted ${powerInserted} rows into power_consumption (${DAYS} days, 15-min intervals)`);
    }
  } else {
    console.log("⚠️  power_consumption table not found — skipping");
  }

  // Step 12: Seed high-frequency data for LTTB demo (10,000 points)
  console.log("\nStep 12: Seed high-frequency sensor data (LTTB demo)...");
  const hfTable = allTables.find(t => t.name === "highfreq_sensor") ||
    (await get("/api/tables")).data?.tables?.find(t => t.name === "highfreq_sensor");
  if (hfTable) {
    const checkHf = await get(`/api/tables/${hfTable.id}/data?limit=1`);
    const existingHf = checkHf.data?.total || checkHf.data?.rows?.length || 0;
    if (existingHf > 0) {
      console.log(`⏭️  highfreq_sensor already has ${existingHf} rows — skipping`);
    } else {
      const HF_POINTS = 10000;
      const hfRows = [];
      const hfStart = now - HF_POINTS * 1000; // 1-second intervals going back ~2.7 hours
      for (let i = 0; i < HF_POINTS; i++) {
        const t = hfStart + i * 1000;
        const ts = new Date(t);
        // Complex signal: sine + noise + occasional spikes
        const base = 50 + 20 * Math.sin(i * 0.01) + 10 * Math.sin(i * 0.073);
        const spike = Math.random() > 0.98 ? (Math.random() * 40 - 20) : 0;
        const noise = (Math.random() - 0.5) * 5;
        const value = +(base + noise + spike).toFixed(2);
        const signal_b = +(30 + 15 * Math.cos(i * 0.015) + (Math.random() - 0.5) * 3).toFixed(2);
        hfRows.push({ timestamp: ts.toISOString(), value, signal_b });
      }
      let hfInserted = 0;
      for (let i = 0; i < hfRows.length; i += 50) {
        const batch = hfRows.slice(i, i + 50);
        const res = await post(`/api/tables/${hfTable.id}/data`, { rows: batch });
        if (res.status === 200 || res.status === 201) hfInserted += batch.length;
      }
      console.log(`✅ Inserted ${hfInserted} rows into highfreq_sensor (1s intervals, ${(HF_POINTS/3600).toFixed(1)}h span)`);
    }
  } else {
    console.log("⚠️  highfreq_sensor table not found — skipping");
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Demo scenario seeded successfully!");
  console.log("=".repeat(50));
  console.log("\nLogin:  org = acme, username = cue, password = admin123");
  console.log("Then:   Workspace → E2E Demo folder");
  console.log("\nPages:");
  console.log("  🌡️ Sensor Simulator     — adjust temp/humidity, publish via MQTT");
  console.log("  ⚙️ Sensor ETL Pipeline  — visual flow, runs as service");
  console.log("  🔌 Sensor API Service   — REST API querying ClickHouse, runs as service");
  console.log("  📊 Sensor Dashboard     — live data from 4 sources (WS, MQTT, ClickHouse, API)");
  console.log("  📈 Sensor Charts        — Chart.js dashboard: line, bar, area, scatter, multi-series");
  console.log("  ⚡ Energy Intelligence   — AC model: predict energy, cost, warmup, break-even");
  console.log("  📓 Sensor Analysis      — Jupyter notebook, Python SDK, charts from ClickHouse");
}

seed().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
