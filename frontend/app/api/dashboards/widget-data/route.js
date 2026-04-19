import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { queryData, queryDataAdvanced, listOrgTables } from "../../../../lib/org-tables.js";
import { query } from "../../../../lib/db.js";

// POST — fetch data for a widget config
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { widget, controlState } = await request.json();
  if (!widget) return NextResponse.json({ error: "Widget config required" }, { status: 400 });

  try {
    const data = await resolveWidgetData(user.org_id, widget, controlState || {});
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// Format a timestamp/date label for chart display
function formatLabel(val) {
  if (!val) return "";
  const s = String(val);
  if (s.length > 16 && s.includes("T")) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return s.length > 20 ? s.slice(0, 20) : s;
}

// Build filters array from widget config bindings + control state
function resolveFilters(config, controlState) {
  const filters = [];
  const bindings = config?.filters || [];
  for (const f of bindings) {
    if (!f.column || !f.var_name) continue;
    const value = controlState[f.var_name];
    if (value === undefined || value === null || value === "") continue;
    filters.push({ column: f.column, op: f.op || "eq", value: String(value) });
  }
  return filters;
}

async function resolveWidgetData(orgId, widget, controlState) {
  const { type, config } = widget;

  if (type === "text" || type === "slider" || type === "select" || type === "energy") {
    return {};
  }

  if (!config?.table) {
    return { rows: [], message: "No table configured" };
  }

  // Resolve control-driven filters
  const filters = resolveFilters(config, controlState);

  // Chart types can request more data (LTTB handles rendering performance)
  const isChart = type === "chart" || ["line", "bar", "pie", "doughnut", "area", "scatter"].includes(type);
  const defaultLimit = isChart ? 2000 : 200;
  const maxLimit = isChart ? 10000 : 1000;
  const limit = Math.min(config.limit || defaultLimit, maxLimit);

  // Use advanced query if filters exist, basic otherwise
  let rows;
  if (filters.length > 0) {
    const result = await queryDataAdvanced(orgId, config.table, {
      limit,
      order_by: config.order_by || config.x_column || "created_at",
      order_dir: config.order_dir || "ASC",
      filters,
    });
    rows = result.rows;
  } else {
    rows = await queryData(orgId, config.table, {
      limit,
      order_by: config.order_by || config.x_column || "created_at",
      order_dir: config.order_dir || "ASC",
    });
  }

  // ─── Stat / Gauge ─────────────────────────────────────────────────────────
  if (type === "stat" || type === "gauge") {
    const col = config.column;
    const agg = config.aggregation || "count";
    if (!col || agg === "count") return { value: rows.length, label: config.label || "Count" };
    const values = rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));
    let value;
    if (agg === "avg") value = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    else if (agg === "sum") value = values.reduce((a, b) => a + b, 0);
    else if (agg === "min") value = Math.min(...values);
    else if (agg === "max") value = Math.max(...values);
    else value = values.length;
    return { value: Math.round(value * 100) / 100, label: config.label || `${agg}(${col})` };
  }

  if (type === "table") {
    return { rows, columns: config.columns || Object.keys(rows[0] || {}) };
  }

  // ─── Chart type (unified) ────────────────────────────────────────────────
  if (type === "chart" || ["line", "bar", "pie", "doughnut", "area", "scatter"].includes(type)) {
    const xCol = config.x_column || "created_at";
    const labels = rows.map((r) => formatLabel(r[xCol]));

    const seriesCfg = config.series || [];
    if (seriesCfg.length > 0) {
      const series = seriesCfg.map((s) => ({
        label: s.label || s.y_column,
        color: s.color || undefined,
        values: rows.map((r) => parseFloat(r[s.y_column]) || 0),
      }));
      return { labels, series, x_label: config.x_label || xCol, y_label: config.y_label || "" };
    }

    const yCol = config.y_column;
    if (!yCol) return { labels: [], series: [], message: "No data column configured" };
    const values = rows.map((r) => parseFloat(r[yCol]) || 0);
    return {
      labels,
      series: [{ label: config.y_label || yCol, values }],
      values,
      x_label: config.x_label || xCol,
      y_label: config.y_label || yCol,
    };
  }

  return { rows };
}
