import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { getOrgFeatures } from "../../../lib/features.js";

// Get current org's enabled features (for nav menu + access control)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ features: [] });

  const features = await getOrgFeatures(user.org_id);
  // Only return enabled features with their config
  const enabled = features.filter((f) => f.enabled).map((f) => ({
    id: f.id,
    name: f.name,
    icon: f.icon,
    config: f.config,
  }));

  return NextResponse.json({ features: enabled });
}
