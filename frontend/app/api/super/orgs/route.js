import { NextResponse } from "next/server";
import { query } from "../../../../lib/db.js";
import { requireSuperAdmin } from "../../../../lib/super-auth.js";
import { createDefaultRoles } from "../../../../lib/permissions.js";

// List all orgs
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await query(`
    SELECT o.*,
           (SELECT COUNT(*) FROM users WHERE org_id = o.id) as user_count
    FROM organizations o
    ORDER BY o.created_at
  `);
  return NextResponse.json({ orgs: result.rows });
}

// Create org
export async function POST(request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { name, slug, plan, storage_limit_mb } = await request.json();

  if (!name || !slug) {
    return NextResponse.json({ error: "Name and slug required" }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug must be lowercase alphanumeric with hyphens" }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO organizations (name, slug, plan, storage_limit_mb)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, plan || "free", storage_limit_mb || 1000]
    );
    // Auto-create default roles for new org
    await createDefaultRoles(result.rows[0].id);

    return NextResponse.json({ org: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Organization name or slug already exists" }, { status: 409 });
    }
    throw err;
  }
}
