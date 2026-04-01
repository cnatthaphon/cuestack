import { query } from "./db.js";

// --- Feature Catalog (all available features) ---

export const FEATURE_CATALOG = [
  {
    id: "databases",
    name: "Database Management",
    description: "Create and manage analytical + transactional tables",
    default_config: { max_tables: 10 },
    icon: "db",
  },
  {
    id: "api",
    name: "External API",
    description: "API keys for external data access (insert/query)",
    default_config: { rate_limit: 100, max_keys: 5 },
    icon: "api",
  },
  {
    id: "dashboards",
    name: "Dashboards",
    description: "Create and view data dashboards",
    default_config: { max_dashboards: 10 },
    icon: "dashboard",
  },
  {
    id: "notebooks",
    name: "Jupyter Notebooks",
    description: "Python notebooks connected to org databases",
    default_config: { max_sessions: 2, runtime_min_month: 120 },
    icon: "notebook",
  },
  {
    id: "python_services",
    name: "Python Services",
    description: "Deploy Python code as web services/API endpoints",
    default_config: { max_services: 2, runtime_min_month: 300 },
    icon: "python",
  },
  {
    id: "app_builder",
    name: "App Builder",
    description: "Visual programming to build and publish web apps",
    default_config: { max_apps: 5 },
    icon: "app",
  },
  {
    id: "websocket",
    name: "Real-time WebSocket",
    description: "Real-time data push via WebSocket connections",
    default_config: { max_connections: 10 },
    icon: "realtime",
  },
  {
    id: "devices",
    name: "Device Management",
    description: "Register and manage IoT devices with auth",
    default_config: { max_devices: 50 },
    icon: "device",
  },
  {
    id: "mqtt",
    name: "MQTT Ingestion",
    description: "MQTT broker for IoT device data ingestion",
    default_config: { max_topics: 20 },
    icon: "mqtt",
  },
];

// --- Default features per plan ---

const PLAN_FEATURES = {
  free: ["databases", "api", "dashboards"],
  pro: ["databases", "api", "dashboards", "notebooks", "websocket", "devices"],
  enterprise: FEATURE_CATALOG.map((f) => f.id), // all
};

// --- Assign default features for a plan ---

export async function assignPlanFeatures(orgId, plan) {
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  for (const featureId of features) {
    const catalog = FEATURE_CATALOG.find((f) => f.id === featureId);
    await query(
      `INSERT INTO org_features (org_id, feature, config)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, feature) DO NOTHING`,
      [orgId, featureId, JSON.stringify(catalog?.default_config || {})]
    );
  }
}

// --- Check if org has a feature ---

export async function hasFeature(orgId, featureId) {
  if (!orgId) return false;
  const result = await query(
    "SELECT enabled FROM org_features WHERE org_id = $1 AND feature = $2",
    [orgId, featureId]
  );
  return result.rows[0]?.enabled === true;
}

// --- Get feature config ---

export async function getFeatureConfig(orgId, featureId) {
  const result = await query(
    "SELECT config FROM org_features WHERE org_id = $1 AND feature = $2 AND enabled = true",
    [orgId, featureId]
  );
  return result.rows[0]?.config || null;
}

// --- Get all features for an org ---

export async function getOrgFeatures(orgId) {
  const result = await query(
    "SELECT feature, config, enabled FROM org_features WHERE org_id = $1 ORDER BY feature",
    [orgId]
  );
  // Merge with catalog for full info
  return FEATURE_CATALOG.map((cat) => {
    const org = result.rows.find((r) => r.feature === cat.id);
    return {
      ...cat,
      enabled: org?.enabled || false,
      config: org?.config || cat.default_config,
      assigned: !!org,
    };
  });
}

// --- Set feature for org (Super Admin) ---

export async function setOrgFeature(orgId, featureId, enabled, config) {
  if (enabled) {
    const catalog = FEATURE_CATALOG.find((f) => f.id === featureId);
    await query(
      `INSERT INTO org_features (org_id, feature, config, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (org_id, feature) DO UPDATE SET enabled = true, config = COALESCE($3, org_features.config)`,
      [orgId, featureId, config ? JSON.stringify(config) : JSON.stringify(catalog?.default_config || {})]
    );
  } else {
    await query(
      `UPDATE org_features SET enabled = false WHERE org_id = $1 AND feature = $2`,
      [orgId, featureId]
    );
  }
}
