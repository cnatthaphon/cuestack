import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { query } from "../../../lib/db.js";
import registry from "../../../lib/block-registry.json";

// GET — list system blocks + org custom blocks (merged)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // System blocks (from registry file)
  const systemBlocks = registry.blocks.map(b => ({ ...b, _custom: false }));

  // Org custom blocks (from DB — may not exist on fresh installs)
  let orgBlocks = [];
  try {
    const result = await query(
      `SELECT * FROM org_custom_blocks WHERE org_id = $1 AND is_active = true ORDER BY label`,
      [user.org_id]
    );
    orgBlocks = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      label: row.label,
      icon: row.icon || "🧩",
      category: row.category || "custom",
      description: row.description || "",
      configSchema: row.config_schema || [],
      inputs: row.inputs || [{ name: "data", type: "any" }],
      outputs: row.outputs || [{ name: "data", type: "any" }],
      code: row.code,
      color: row.color || "#6b7280",
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      _custom: true,
    }));
  } catch {
    // Table may not exist yet — return system blocks only
  }

  return NextResponse.json({
    blocks: [...systemBlocks, ...orgBlocks],
    categories: registry.categories,
    configTypes: registry.configTypes,
  });
}

// POST — create a new org custom block (org admin)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const { type, label, icon, category, description, config_schema, inputs, outputs, code, color } = body;

  // Validate required fields
  if (!type || !label) {
    return NextResponse.json({ error: "type and label are required" }, { status: 400 });
  }

  // Type must start with "custom_" to avoid collision with system blocks
  if (!type.startsWith("custom_")) {
    return NextResponse.json({ error: "Block type must start with 'custom_'" }, { status: 400 });
  }

  // Only alphanumeric + underscore for type
  if (!/^custom_[a-z0-9_]+$/.test(type)) {
    return NextResponse.json({ error: "Block type must be lowercase alphanumeric with underscores (e.g. custom_my_block)" }, { status: 400 });
  }

  // Check no collision with system blocks
  const systemTypes = registry.blocks.map(b => b.type);
  if (systemTypes.includes(type)) {
    return NextResponse.json({ error: "Block type conflicts with a system block" }, { status: 409 });
  }

  // Code must contain def transform
  const blockCode = code || "def transform(data, config):\n    return data";
  if (!blockCode.includes("def transform")) {
    return NextResponse.json({ error: "Code must contain a 'def transform(data, config)' function" }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO org_custom_blocks (org_id, type, label, icon, category, description, config_schema, inputs, outputs, code, color, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        user.org_id,
        type,
        label,
        icon || "🧩",
        category || "custom",
        description || "",
        JSON.stringify(config_schema || []),
        JSON.stringify(inputs || [{ name: "data", type: "any" }]),
        JSON.stringify(outputs || [{ name: "data", type: "any" }]),
        blockCode,
        color || "#6b7280",
        user.id,
      ]
    );

    return NextResponse.json({ block: result.rows[0] }, { status: 201 });
  } catch (e) {
    if (e.code === "23505") {
      return NextResponse.json({ error: "Block type already exists in this org" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
