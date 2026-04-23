import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { insertData, queryData, queryDataAdvanced } from "../../../../lib/org-tables.js";
import { query } from "../../../../lib/db.js";
import { computeAll, predictEnergy, recommend as recommendFn } from "../../../../lib/energy-formulas.js";
import { energyMonitor } from "../../../../lib/energy-intelligence.js";

const CACHE_TTL = 300; // 5 minutes

/**
 * POST /api/dashboards/compute
 *
 * Caching strategy for energy_monitor:
 * 1. Check ei_cache for fresh result (< TTL)
 * 2. If fresh → return cached (instant)
 * 3. If stale/missing → compute → write cache → return
 * 4. force_refresh=true bypasses cache
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { formula, model_config, inputs, output_table, source_table, force_refresh } = await request.json();
  if (!formula) return NextResponse.json({ error: "formula required" }, { status: 400 });

  try {
    let result;

    if (formula === "energy_all") {
      if (!model_config) return NextResponse.json({ error: "model_config required" }, { status: 400 });
      result = computeAll(model_config, inputs || {});
    } else if (formula === "energy_compare" || formula === "energy_monitor") {
      const src = source_table || "power_consumption";
      const cacheKey = `ei_monitor_${src}_${JSON.stringify(inputs || {}).slice(0, 100)}`;

      // Check cache (unless force refresh)
      if (!force_refresh) {
        try {
          const cached = await queryDataAdvanced(user.org_id, "ei_cache", {
            limit: 1,
            filters: [{ column: "cache_key", op: "eq", value: cacheKey }],
            order_by: "created_at", order_dir: "DESC",
          });
          if (cached.rows.length > 0) {
            const row = cached.rows[0];
            const age = (Date.now() - new Date(row.computed_at).getTime()) / 1000;
            const ttl = row.ttl_seconds || CACHE_TTL;
            if (age < ttl) {
              const cachedResult = typeof row.result === "string" ? JSON.parse(row.result) : row.result;
              cachedResult._cached = true;
              cachedResult._cache_age = Math.round(age);
              return NextResponse.json({ data: cachedResult });
            }
          }
        } catch {} // cache table may not exist
      }

      // Compute fresh
      const rows = await queryData(user.org_id, src, {
        limit: 10000, order_by: "timestamp", order_dir: "ASC",
      });

      let precomputed = null;
      try {
        precomputed = await queryData(user.org_id, "ei_daily_stats", {
          limit: 500, order_by: "created_at", order_dir: "DESC",
        });
      } catch {}

      result = energyMonitor(rows, model_config || {}, inputs || {}, precomputed);

      // Add recommendation based on latest conditions
      if (result.daily_stats?.length > 0 && model_config && Object.keys(model_config).length > 0) {
        const latest = result.daily_stats[result.daily_stats.length - 1];
        try {
          result.recommendation = recommendFn(model_config, {
            Ti: latest.ti_start || 30,
            Te: latest.avg_te || 30,
            hours_away: inputs?.hours_away || 3,
            setpoint: inputs?.setpoint || 24,
          });
        } catch {}
      }

      // Write to cache
      try {
        // Delete old cache entries for this key
        await queryDataAdvanced(user.org_id, "ei_cache", {
          limit: 1, filters: [{ column: "cache_key", op: "eq", value: cacheKey }],
        }).then(async (old) => {
          // We can't delete via queryDataAdvanced, so just insert new (old entries expire naturally)
        }).catch(() => {});

        await insertData(user.org_id, "ei_cache", [{
          cache_key: cacheKey,
          result: JSON.stringify(result),
          computed_at: new Date().toISOString(),
          ttl_seconds: CACHE_TTL,
        }]);
        result._cached = false;
      } catch {} // cache write is best-effort

    } else {
      return NextResponse.json({ error: `Unknown formula: ${formula}` }, { status: 400 });
    }

    // Persist to output table
    if (output_table && result && !result._cached) {
      try {
        await insertData(user.org_id, output_table, [{
          formula,
          inputs: JSON.stringify(result.inputs || inputs || {}),
          energy_kwh: result.summary?.actual_total_kWh || result.energy?.total_kWh,
          cost_thb: result.summary?.actual_cost_thb || result.cost?.total_thb,
          pulldown_min: result.time?.pulldown_min || 0,
          recommendation: result.recommendation?.recommendation || result.summary?.overall_status || "",
          computed_at: new Date().toISOString(),
        }]);
        result._persisted = true;
      } catch (e) {
        result._persist_error = e.message;
      }

      // Push critical alerts to notifications
      if (result.alerts?.length > 0) {
        for (const alert of result.alerts.filter((a) => a.severity === "critical")) {
          try {
            await query(
              `INSERT INTO notifications (org_id, user_id, title, message, type, source)
               SELECT $1, id, $2, $3, 'warning', 'energy_monitor' FROM users WHERE org_id = $1 AND role_id = 1
               ON CONFLICT DO NOTHING`,
              [user.org_id, `Energy Alert: ${alert.type}`, alert.message]
            );
          } catch {}
        }
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
