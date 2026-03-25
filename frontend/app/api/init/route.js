import { NextResponse } from "next/server";
import { initDB } from "../../../lib/db.js";
import { seedAdmin } from "../../../lib/auth.js";

// Called once on first request to ensure DB is ready
let initialized = false;

export async function GET() {
  if (!initialized) {
    await initDB();
    await seedAdmin();
    initialized = true;
  }
  return NextResponse.json({ ok: true });
}
