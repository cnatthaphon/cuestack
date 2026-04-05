import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";

// GET — get single custom block details
export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const result = await query(
    "SELECT * FROM org_custom_blocks WHERE id = $1 AND org_id = $2",
    [id, user.org_id]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ block: result.rows[0] });
}

// PATCH — update custom block
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  // Verify block exists and belongs to this org
  const existing = await query(
    "SELECT * FROM org_custom_blocks WHERE id = $1 AND org_id = $2",
    [id, user.org_id]
  );
  if (!existing.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates = [];
  const values = [id, user.org_id];
  let i = 3;

  const allowedFields = ["label", "icon", "category", "description", "color", "is_active"];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(body[field]);
      i++;
    }
  }

  // JSON fields
  const jsonFields = ["config_schema", "inputs", "outputs"];
  for (const field of jsonFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(JSON.stringify(body[field]));
      i++;
    }
  }

  // Code field — must contain def transform if provided
  if (body.code !== undefined) {
    if (!body.code.includes("def transform")) {
      return NextResponse.json({ error: "Code must contain a 'def transform(data, config)' function" }, { status: 400 });
    }
    updates.push(`code = $${i}`);
    values.push(body.code);
    i++;
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push(`updated_at = NOW()`);

  await query(
    `UPDATE org_custom_blocks SET ${updates.join(", ")} WHERE id = $1 AND org_id = $2`,
    values
  );

  const updated = await query("SELECT * FROM org_custom_blocks WHERE id = $1", [id]);
  return NextResponse.json({ block: updated.rows[0] });
}

// DELETE — delete custom block
export async function DELETE(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  // Verify it exists in this org
  const existing = await query(
    "SELECT type FROM org_custom_blocks WHERE id = $1 AND org_id = $2",
    [id, user.org_id]
  );
  if (!existing.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check if block type is used in any active flow (user_pages with page_type='visual')
  const blockType = existing.rows[0].type;
  const usedInFlows = await query(
    `SELECT id, name FROM user_pages
     WHERE org_id = $1 AND page_type = 'visual'
       AND config::text LIKE $2`,
    [user.org_id, `%"${blockType}"%`]
  );

  if (usedInFlows.rows.length > 0) {
    const names = usedInFlows.rows.map(r => r.name).join(", ");
    return NextResponse.json(
      { error: `Block is used in active flows: ${names}. Remove it from those flows first.` },
      { status: 409 }
    );
  }

  await query("DELETE FROM org_custom_blocks WHERE id = $1 AND org_id = $2", [id, user.org_id]);
  return NextResponse.json({ ok: true });
}
