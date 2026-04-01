import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db.js";
import { queryData } from "../../../../../lib/org-tables.js";

// POST — public widget data (same as dashboard widget-data but scoped to org)
export async function POST(request, { params }) {
  const { org } = await params;

  const orgRes = await query("SELECT id FROM organizations WHERE slug = $1 AND is_active = true", [org]);
  if (!orgRes.rows[0]) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const orgId = orgRes.rows[0].id;

  const { widget } = await request.json();
  if (!widget) return NextResponse.json({ error: "Widget config required" }, { status: 400 });

  try {
    const data = await resolvePublicWidget(orgId, widget);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

async function resolvePublicWidget(orgId, widget) {
  const { type, config } = widget;
  if (type === "text") return { text: config?.text || "" };
  if (!config?.table) return { rows: [], message: "No table configured" };

  const rows = await queryData(orgId, config.table, {
    limit: config.limit || 100,
    order_by: config.order_by || "created_at",
    order_dir: config.order_dir || "DESC",
  });

  if (type === "stat") {
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

  if (type === "table") return { rows, columns: config.columns || Object.keys(rows[0] || {}) };

  if (["line", "bar", "pie"].includes(type)) {
    const xCol = config.x_column || "created_at";
    const yCol = config.y_column;
    if (!yCol) return { labels: [], values: [] };
    return {
      labels: rows.map((r) => r[xCol]).reverse(),
      values: rows.map((r) => parseFloat(r[yCol]) || 0).reverse(),
    };
  }

  return { rows };
}
