import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { queryData } from "../../../lib/org-tables.js";
import { query } from "../../../lib/db.js";

// POST — execute a visual flow (block pipeline)
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { blocks } = await request.json();
  if (!blocks || !Array.isArray(blocks)) return NextResponse.json({ error: "blocks required" }, { status: 400 });

  try {
    const result = await executeFlow(user.org_id, user.id, blocks);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function executeFlow(orgId, userId, blocks) {
  let data = [];
  const results = [];

  for (const block of blocks) {
    const { type, config } = block;

    try {
      if (type === "data_source") {
        if (!config?.table) { results.push({ block: "Data Source", error: "No table selected" }); continue; }
        data = await queryData(orgId, config.table, {
          limit: config.limit || 100,
          order_by: config.order_by || "created_at",
          order_dir: "DESC",
        });
        results.push({ block: "Data Source", rows: data, message: `${data.length} rows from ${config.table}` });
      }

      else if (type === "filter") {
        if (!config?.column) { results.push({ block: "Filter", error: "No column selected" }); continue; }
        const before = data.length;
        data = data.filter((row) => {
          const val = row[config.column];
          const cmp = config.value;
          switch (config.operator) {
            case "=": return String(val) === String(cmp);
            case "!=": return String(val) !== String(cmp);
            case ">": return Number(val) > Number(cmp);
            case "<": return Number(val) < Number(cmp);
            case ">=": return Number(val) >= Number(cmp);
            case "<=": return Number(val) <= Number(cmp);
            case "contains": return String(val).includes(String(cmp));
            case "is null": return val == null || val === "";
            case "is not null": return val != null && val !== "";
            default: return true;
          }
        });
        results.push({ block: "Filter", message: `${before} → ${data.length} rows (${config.column} ${config.operator} ${config.value || ""})` });
      }

      else if (type === "transform") {
        if (!config?.operation || !config?.column) { results.push({ block: "Transform", error: "Missing config" }); continue; }
        const col = config.column;
        const outCol = config.output_column || col;
        data = data.map((row) => {
          const v = row[col];
          let nv = v;
          switch (config.operation) {
            case "round": nv = Math.round(Number(v) || 0); break;
            case "uppercase": nv = String(v || "").toUpperCase(); break;
            case "lowercase": nv = String(v || "").toLowerCase(); break;
            case "abs": nv = Math.abs(Number(v) || 0); break;
            case "to_number": nv = Number(v) || 0; break;
            case "to_date": nv = new Date(v).toISOString(); break;
          }
          return { ...row, [outCol]: nv };
        });
        results.push({ block: "Transform", message: `${config.operation}(${col}) → ${data.length} rows` });
      }

      else if (type === "aggregate") {
        if (!config?.aggregation) { results.push({ block: "Aggregate", error: "No aggregation selected" }); continue; }
        const col = config.column;
        const groupBy = config.group_by;

        if (groupBy) {
          const groups = {};
          for (const row of data) {
            const key = String(row[groupBy] ?? "null");
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
          }
          data = Object.entries(groups).map(([key, rows]) => {
            const vals = col ? rows.map((r) => Number(r[col]) || 0) : rows;
            let value;
            switch (config.aggregation) {
              case "count": value = rows.length; break;
              case "sum": value = vals.reduce((a, b) => a + b, 0); break;
              case "avg": value = vals.reduce((a, b) => a + b, 0) / (vals.length || 1); break;
              case "min": value = Math.min(...vals); break;
              case "max": value = Math.max(...vals); break;
            }
            return { [groupBy]: key, [`${config.aggregation}_${col || "count"}`]: Math.round(value * 100) / 100 };
          });
          results.push({ block: "Aggregate", message: `${config.aggregation} by ${groupBy}: ${data.length} groups` });
        } else {
          const vals = col ? data.map((r) => Number(r[col]) || 0) : data;
          let value;
          switch (config.aggregation) {
            case "count": value = data.length; break;
            case "sum": value = vals.reduce((a, b) => a + b, 0); break;
            case "avg": value = vals.reduce((a, b) => a + b, 0) / (vals.length || 1); break;
            case "min": value = Math.min(...vals); break;
            case "max": value = Math.max(...vals); break;
          }
          results.push({ block: "Aggregate", value: Math.round(value * 100) / 100, message: `${config.aggregation}(${col || "*"}) = ${Math.round(value * 100) / 100}` });
        }
      }

      else if (type === "generate") {
        const count = Math.min(parseInt(config?.count) || 1, 100);
        const fields = config?.fields || {};
        const generated = [];
        for (let g = 0; g < count; g++) {
          const row = {};
          for (const [fname, fspec] of Object.entries(fields)) {
            if (typeof fspec === "object" && fspec.type === "float") {
              row[fname] = Math.round((Math.random() * ((fspec.max || 100) - (fspec.min || 0)) + (fspec.min || 0)) * 10) / 10;
            } else if (typeof fspec === "object" && fspec.type === "int") {
              row[fname] = Math.floor(Math.random() * ((fspec.max || 100) - (fspec.min || 0)) + (fspec.min || 0));
            } else if (typeof fspec === "object" && fspec.type === "choice") {
              const opts = fspec.options || ["unknown"];
              row[fname] = opts[Math.floor(Math.random() * opts.length)];
            } else {
              row[fname] = fspec;
            }
          }
          generated.push(row);
        }
        data = generated;
        results.push({ block: "Generate", message: `${data.length} rows generated` });
      }

      else if (type === "insert") {
        if (!config?.table) { results.push({ block: "Insert", error: "No table selected" }); continue; }
        if (data.length === 0) { results.push({ block: "Insert", error: "No data to insert" }); continue; }
        try {
          const inserted = await insertData(orgId, config.table, data);
          results.push({ block: "Insert", message: `${inserted} rows inserted into ${config.table}` });
        } catch (e) {
          results.push({ block: "Insert", error: e.message });
        }
      }

      else if (type === "output") {
        results.push({ block: "Output", message: `${data.length} rows as ${config?.format || "table"}`, rows: data });
      }

      else if (type === "notify") {
        if (config?.title) {
          await query(
            `INSERT INTO notifications (org_id, user_id, title, message, type, source) VALUES ($1, $2, $3, $4, $5, 'flow')`,
            [orgId, userId, config.title, config.message || "", config.type || "info"]
          );
          results.push({ block: "Notify", message: `Sent: ${config.title}` });
        }
      }
    } catch (e) {
      results.push({ block: type, error: e.message });
    }
  }

  return { results, data: data.slice(0, 100) };
}
