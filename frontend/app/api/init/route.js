import { NextResponse } from "next/server";
import { initDB, initJupyterUser } from "../../../lib/db.js";
import { seedData } from "../../../lib/auth.js";

// Called once on first request to ensure DB is ready
let initialized = false;

export async function GET() {
  if (!initialized) {
    await initDB();
    await seedData();
    await initJupyterUser();
    initialized = true;
  }
  return NextResponse.json({ ok: true });
}
