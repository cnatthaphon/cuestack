import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth.js";
import { queryData, insertData } from "../../../lib/org-tables.js";
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

      else if (type === "anomaly_detection") {
        const col = config?.column;
        const threshold = parseFloat(config?.threshold) || 2.0;
        if (!col || data.length < 3) { results.push({ block: "Anomaly Detection", error: "Need column + 3+ rows" }); continue; }
        const vals = data.map((r) => parseFloat(r[col]) || 0);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
        let anomalies = 0;
        data = data.map((r, i) => {
          const z = std > 0 ? (vals[i] - mean) / std : 0;
          const isAnomaly = Math.abs(z) > threshold;
          if (isAnomaly) anomalies++;
          return { ...r, _z_score: Math.round(z * 1000) / 1000, _anomaly: isAnomaly };
        });
        results.push({ block: "Anomaly Detection", message: `${anomalies}/${data.length} anomalies (threshold=${threshold}, mean=${Math.round(mean*100)/100})` });
      }

      else if (type === "statistics") {
        const col = config?.column;
        if (!col || data.length === 0) { results.push({ block: "Statistics", error: "Need column + data" }); continue; }
        const vals = data.map((r) => parseFloat(r[col]) || 0).sort((a, b) => a - b);
        const n = vals.length;
        const mean = vals.reduce((a, b) => a + b, 0) / n;
        const std = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
        data = [{ column: col, count: n, mean: Math.round(mean*1000)/1000, std: Math.round(std*1000)/1000, min: vals[0], q1: vals[Math.floor(n/4)], median: vals[Math.floor(n/2)], q3: vals[Math.floor(3*n/4)], max: vals[n-1] }];
        results.push({ block: "Statistics", message: `Stats(${col}): mean=${Math.round(mean*100)/100}, std=${Math.round(std*100)/100}, n=${n}` });
      }

      else if (type === "moving_average") {
        const col = config?.column;
        const window = parseInt(config?.window) || 5;
        if (!col) { results.push({ block: "Moving Average", error: "Need column" }); continue; }
        const outCol = `${col}_ma${window}`;
        const vals = data.map((r) => parseFloat(r[col]) || 0);
        data = data.map((r, i) => {
          const start = Math.max(0, i - window + 1);
          const windowVals = vals.slice(start, i + 1);
          return { ...r, [outCol]: Math.round(windowVals.reduce((a, b) => a + b, 0) / windowVals.length * 1000) / 1000 };
        });
        results.push({ block: "Moving Average", message: `MA(${col}, window=${window}) -> ${outCol}` });
      }

      else if (type === "fft") {
        const col = config?.column;
        if (!col || data.length < 8) { results.push({ block: "FFT", error: "Need column + 8+ rows" }); continue; }
        const vals = data.map((r) => parseFloat(r[col]) || 0);
        const n = vals.length;
        const mean = vals.reduce((a, b) => a + b, 0) / n;
        const centered = vals.map((v) => v - mean);
        // Simple DFT (pure JS)
        const freqs = [];
        for (let k = 0; k < n / 2; k++) {
          let real = 0, imag = 0;
          for (let i = 0; i < n; i++) {
            const angle = 2 * Math.PI * k * i / n;
            real += centered[i] * Math.cos(angle);
            imag -= centered[i] * Math.sin(angle);
          }
          const mag = Math.sqrt(real * real + imag * imag) / n;
          if (mag > 0.01) freqs.push({ frequency: Math.round(k / n * 10000) / 10000, magnitude: Math.round(mag * 1000) / 1000 });
        }
        freqs.sort((a, b) => b.magnitude - a.magnitude);
        data = freqs.slice(0, 5);
        results.push({ block: "FFT", message: `FFT(${col}): ${data.length} dominant frequencies from ${n} samples` });
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
