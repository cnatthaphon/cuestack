import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";
import { getCurrentUser } from "../../../lib/auth.js";

// List all available permissions (for role management UI)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await query(
    "SELECT id, category, description FROM permissions ORDER BY category, id"
  );
  return NextResponse.json({ permissions: result.rows });
}
