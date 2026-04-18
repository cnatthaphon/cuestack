import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { insertData, queryData } from "../../../../lib/org-tables.js";
import { computeAll, predictEnergy } from "../../../../lib/energy-formulas.js";
import { energyMonitor } from "../../../../lib/energy-intelligence.js";

/**
 * POST /api/dashboards/compute
 *
 * Formulas:
 *   "energy_all"     — what-if: model params + slider inputs → predictions
 *   "energy_compare" — intelligence: reads power_consumption from DB,
 *                      compares actual vs model-predicted, bins by power level,
 *                      calculates savings per day
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { formula, model_config, inputs, output_table, source_table } = await request.json();
  if (!formula) return NextResponse.json({ error: "formula required" }, { status: 400 });
  if (!model_config) return NextResponse.json({ error: "model_config required" }, { status: 400 });

  try {
    let result;

    if (formula === "energy_all") {
      result = computeAll(model_config, inputs || {});
    } else if (formula === "energy_compare" || formula === "energy_monitor") {
      const rows = await queryData(user.org_id, source_table || "power_consumption", {
        limit: 1000, order_by: "timestamp", order_dir: "ASC",
      });
      // Try to load pre-computed predictions from training
      let precomputed = null;
      try {
        precomputed = await queryData(user.org_id, "ei_daily_stats", {
          limit: 500, order_by: "created_at", order_dir: "DESC",
        });
      } catch {} // table may not exist yet
      result = energyMonitor(rows, model_config, inputs || {}, precomputed);
    } else {
      return NextResponse.json({ error: `Unknown formula: ${formula}` }, { status: 400 });
    }

    // Persist to org table if requested
    if (output_table && result) {
      try {
        const row = {
          formula,
          inputs: JSON.stringify(result.inputs || inputs || {}),
          energy_kwh: result.summary?.actual_total_kWh || result.energy?.total_kWh,
          cost_thb: result.summary?.actual_cost_thb || result.cost?.total_thb,
          pulldown_min: result.time?.pulldown_min || 0,
          recommendation: result.summary?.overall_status || result.recommendation?.recommendation || "",
          computed_at: new Date().toISOString(),
        };
        await insertData(user.org_id, output_table, [row]);
        result._persisted = true;
      } catch (e) {
        result._persist_error = e.message;
      }
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// GET — read persisted results
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") || "energy_predictions";
  const limit = parseInt(searchParams.get("limit")) || 50;

  try {
    const rows = await queryData(user.org_id, table, { limit, order_by: "created_at", order_dir: "DESC" });
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
