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
 * Login after: org = aimagin, username = cue, password = admin123
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

  // Step 3: Get aimagin org ID
  console.log("Step 3: Find aimagin org...");
  const orgs = await getOrgs();
  const aimagin = orgs.find((o) => o.slug === "aimagin");
  if (!aimagin) {
    console.error("❌ Aimagin org not found. Check init.");
    process.exit(1);
  }
  console.log(`✅ Found org: ${aimagin.name} (${aimagin.id})\n`);

  // Step 4: Create org user
  console.log("Step 4: Create org user...");
  await createUserInOrg(aimagin.id, "cue", "admin123", "Admin");
  console.log();

  // Step 5: Login as org user
  console.log("Step 5: Login as org user...");
  const orgLogin = await login("cue", "admin123", "aimagin");
  if (!orgLogin) process.exit(1);
  console.log();

  // Step 6: Create channels
  console.log("Step 6: Create channels...");
  await createChannel("sensor-room-a", "Temperature & humidity sensor in Room A");
  await createChannel("sensor-room-b", "Temperature & humidity sensor in Room B");
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
  const pages = [
    { file: "page-simulator.json", sort: 1 },
    { file: "page-etl-service.json", sort: 2 },
    { file: "page-dashboard.json", sort: 3 },
  ];

  for (const p of pages) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, p.file), "utf8"));
    await createPage(raw.name, raw.icon, raw.page_type, raw.config, folderId);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Demo scenario seeded successfully!");
  console.log("=".repeat(50));
  console.log("\nLogin:  org = aimagin, username = cue, password = admin123");
  console.log("Then:   Workspace → E2E Demo folder");
  console.log("\nPages:");
  console.log("  🌡️ Sensor Simulator  — adjust temp/humidity, publish to MQTT");
  console.log("  ⚙️ Sensor ETL Pipeline — visual flow, runs as service");
  console.log("  📊 Sensor Dashboard  — live charts, historical data");
}

seed().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
