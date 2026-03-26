import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { queryData } from "../../../lib/org-tables.js";

// POST — execute a visual flow (block pipeline)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { blocks } = await request.json();
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return NextResponse.json({ error: "No blocks provided" }, { status: 400 });
  }

  try {
    const results = await executeFlow(user.org_id, blocks);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

async function executeFlow(orgId, blocks) {
  let data = [];
  const results = [];

  for (const block of blocks) {
    const { type, config } = block;

    if (type === "data_source") {
      if (!config?.table) throw new Error("Data Source: no table configured");
      data = await queryData(orgId, config.table, {
        limit: config.limit || 100,
        order_by: config.order_by,
        order_dir: config.order_dir,
      });
      results.push({ type, rows: data.length });
    }

    else if (type === "filter") {
      const { column, operator, value } = config || {};
      if (!column) throw new Error("Filter: no column configured");
      data = data.filter((row) => {
        const v = row[column];
        const cmp = isNaN(value) ? value : parseFloat(value);
        const rv = isNaN(v) ? v : parseFloat(v);
        switch (operator) {
          case "==": return rv == cmp;
          case "!=": return rv != cmp;
          case ">": return rv > cmp;
          case "<": return rv < cmp;
          case ">=": return rv >= cmp;
          case "<=": return rv <= cmp;
          case "contains": return String(v).includes(String(value));
          default: return true;
        }
      });
      results.push({ type, rows: data.length });
    }

    else if (type === "transform") {
      const { column, operation, param } = config || {};
      if (!column) throw new Error("Transform: no column configured");
      data = data.map((row) => {
        const v = row[column];
        let newVal = v;
        switch (operation) {
          case "round": newVal = Math.round(parseFloat(v) * 100) / 100; break;
          case "abs": newVal = Math.abs(parseFloat(v)); break;
          case "uppercase": newVal = String(v).toUpperCase(); break;
          case "lowercase": newVal = String(v).toLowerCase(); break;
          case "multiply": newVal = parseFloat(v) * parseFloat(param || 1); break;
          case "add": newVal = parseFloat(v) + parseFloat(param || 0); break;
        }
        return { ...row, [column]: newVal };
      });
      results.push({ type, rows: data.length });
    }

    else if (type === "aggregate") {
      const { group_by, agg_column, agg_func } = config || {};
      if (!group_by || !agg_column) throw new Error("Aggregate: missing config");
      const groups = {};
      for (const row of data) {
        const key = String(row[group_by]);
        if (!groups[key]) groups[key] = [];
        groups[key].push(parseFloat(row[agg_column]) || 0);
      }
      data = Object.entries(groups).map(([key, values]) => {
        let agg;
        switch (agg_func) {
          case "count": agg = values.length; break;
          case "sum": agg = values.reduce((a, b) => a + b, 0); break;
          case "avg": agg = values.reduce((a, b) => a + b, 0) / values.length; break;
          case "min": agg = Math.min(...values); break;
          case "max": agg = Math.max(...values); break;
          default: agg = values.length;
        }
        return { [group_by]: key, [agg_column]: Math.round(agg * 100) / 100 };
      });
      results.push({ type, rows: data.length });
    }

    else if (type === "chart") {
      const { chart_type, x_column, y_column, title } = config || {};
      results.push({
        type: "chart",
        chart_type: chart_type || "bar",
        title,
        labels: data.map((r) => r[x_column || Object.keys(r)[0]]),
        values: data.map((r) => parseFloat(r[y_column || Object.keys(r)[1]]) || 0),
      });
    }

    else if (type === "table_output") {
      results.push({
        type: "table_output",
        title: config?.title,
        columns: Object.keys(data[0] || {}),
        rows: data.slice(0, config?.max_rows || 20),
      });
    }

    else if (type === "stat_output") {
      const { column, agg_func, label } = config || {};
      const values = data.map((r) => parseFloat(r[column]) || 0);
      let value;
      switch (agg_func) {
        case "sum": value = values.reduce((a, b) => a + b, 0); break;
        case "avg": value = values.reduce((a, b) => a + b, 0) / (values.length || 1); break;
        case "min": value = values.length ? Math.min(...values) : 0; break;
        case "max": value = values.length ? Math.max(...values) : 0; break;
        default: value = values.length;
      }
      results.push({ type: "stat_output", label: label || `${agg_func}(${column})`, value: Math.round(value * 100) / 100 });
    }

    else if (type === "api_call") {
      // For security: only allow relative URLs (org's own API)
      const url = config?.url;
      if (!url) throw new Error("API Call: no URL configured");
      if (url.startsWith("http")) throw new Error("API Call: only relative URLs allowed (e.g. /api/...)");
      // This would need server-side fetch in production
      results.push({ type: "api_call", message: "API calls execute client-side", url });
    }

    else {
      results.push({ type, error: `Unknown block type: ${type}` });
    }
  }

  return results;
}
