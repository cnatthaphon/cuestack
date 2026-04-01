import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../../../../lib/super-auth.js";
import { getOrgFeatures, setOrgFeature, FEATURE_CATALOG } from "../../../../../../lib/features.js";

// Get org's features (with catalog info)
export async function GET(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const features = await getOrgFeatures(id);
  return NextResponse.json({ features });
}

// Update org feature (enable/disable + config)
export async function PATCH(request, { params }) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const { feature, enabled, config } = await request.json();

  if (!feature) return NextResponse.json({ error: "Feature ID required" }, { status: 400 });
  if (!FEATURE_CATALOG.find((f) => f.id === feature)) {
    return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
  }

  await setOrgFeature(id, feature, enabled, config);
  return NextResponse.json({ ok: true });
}
