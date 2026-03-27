import { NextResponse } from "next/server";
import { query } from "../../../lib/db.js";

// GET /api/health — readiness probe
// Returns 200 if frontend + DB are reachable
export async function GET() {
  const checks = { frontend: "ok", database: "unknown" };

  try {
    const result = await query("SELECT 1 as ping");
    checks.database = result.rows[0]?.ping === 1 ? "ok" : "error";
  } catch (e) {
    checks.database = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
