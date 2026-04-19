import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth.js";
import { queryData, queryDataAdvanced, listOrgTables } from "../../../../lib/org-tables.js";
import { query } from "../../../../lib/db.js";
import { lttbSeries } from "../../../../lib/lttb.js";

// POST — fetch data for a widget config
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { widget, controlState, zoom_range } = await request.json();
  if (!widget) return NextResponse.json({ error: "Widget config required" }, { status: 400 });

  try {
    const data = await resolveWidgetData(user.org_id, widget, controlState || {}, zoom_range);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

function formatLabel(val) {
  if (!val) return "";
  const s = String(val);
  if (s.length > 16 && s.includes("T")) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return s.length > 20 ? s.slice(0, 20) : s;
}

function resolveFilters(config, controlState) {
  const filters = [];
  for (const f of (config?.filters || [])) {
    if (!f.column || !f.var_name) continue;
    const value = controlState[f.var_name];
    if (value === undefined || value === null || value === "") continue;
    const strVal = String(value);
    // Multi-select: comma-separated → multiple OR filters (handled by queryDataAdvanced as IN)
    if (strVal.includes(",")) {
      // Split into individual values, create an "in" filter
      filters.push({ column: f.column, op: "in", value: strVal });
    } else {
      filters.push({ column: f.column, op: f.op || "eq", value: strVal });
    }
  }
  return filters;
}

/**
 * zoom_range: { start_idx, end_idx } — when user zooms, fetch only this range
 * at full resolution. Server-side LTTB downsamples to render_points.
 */
async function resolveWidgetData(orgId, widget, controlState, zoomRange) {
  const { type, config } = widget;

  if (type === "text" || type === "slider" || type === "select" || type === "energy") return {};
  if (!config?.table) return { rows: [], message: "No table configured" };

  const filters = resolveFilters(config, controlState);
  const isChart = type === "chart" || ["line", "bar", "pie", "doughnut", "area", "scatter"].includes(type);

  // How many points to render (sent to client)
  const renderPoints = config.render_points || 300;

  // For zoom requests: fetch the full range then LTTB downsample server-side
  // For initial load: fetch all data, LTTB downsample, send total_rows for zoom context
  const fetchLimit = isChart ? Math.min(config.limit || 10000, 50000) : Math.min(config.limit || 200, 10000);

  let rows;
  if (filters.length > 0) {
    const result = await queryDataAdvanced(orgId, config.table, {
      limit: fetchLimit,
      order_by: config.order_by || config.x_column || "created_at",
      order_dir: config.order_dir || "ASC",
      filters,
    });
    rows = result.rows;
  } else {
    rows = await queryData(orgId, config.table, {
      limit: fetchLimit,
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
    return { rows: rows.slice(0, config.max_rows || 200), columns: config.columns || Object.keys(rows[0] || {}) };
  }

  // ─── Chart type — server-side LTTB ────────────────────────────────────────
  if (isChart) {
    const xCol = config.x_column || "created_at";
    const totalRows = rows.length;

    // If zoom range specified, slice to that range first
    let workingRows = rows;
    if (zoomRange && typeof zoomRange.start_idx === "number" && typeof zoomRange.end_idx === "number") {
      const start = Math.max(0, zoomRange.start_idx);
      const end = Math.min(totalRows, zoomRange.end_idx);
      workingRows = rows.slice(start, end);
    }

    // Build labels and series from working rows
    let labels = workingRows.map((r) => formatLabel(r[xCol]));
    const seriesCfg = config.series || [];
    let series;

    if (seriesCfg.length > 0) {
      series = seriesCfg.map((s) => ({
        label: s.label || s.y_column,
        color: s.color || undefined,
        values: workingRows.map((r) => parseFloat(r[s.y_column]) || 0),
      }));
    } else {
      const yCol = config.y_column;
      if (!yCol) return { labels: [], series: [], message: "No data column configured" };
      series = [{ label: config.y_label || yCol, values: workingRows.map((r) => parseFloat(r[yCol]) || 0) }];
    }

    // Server-side LTTB downsampling (skip for pie/bar/small datasets)
    const chartType = config.chart_type || type;
    const needsDownsample = chartType !== "bar" && chartType !== "pie" && chartType !== "doughnut"
      && labels.length > renderPoints;

    let downsampled = false;
    if (needsDownsample) {
      const ds = lttbSeries(labels, series, renderPoints);
      labels = ds.labels;
      series = ds.series;
      downsampled = true;
    }

    return {
      labels,
      series,
      x_label: config.x_label || xCol,
      y_label: config.y_label || "",
      // Metadata for client-side zoom handling
      _meta: {
        total_rows: totalRows,
        rendered: labels.length,
        downsampled,
        zoom_range: zoomRange || null,
      },
    };
  }

  return { rows };
}
