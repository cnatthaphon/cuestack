"use client";

import { useState, useEffect } from "react";
import { BLOCK_CATALOG, getBlock } from "../../../../../lib/flow-blocks.js";

const CATEGORIES = [
  { id: "input", label: "Input", color: "#0070f3" },
  { id: "transform", label: "Transform", color: "#f59e0b" },
  { id: "output", label: "Output", color: "#38a169" },
];

export default function FlowEditor({ initialBlocks, tables, onSave, onRun, runResults }) {
  const [blocks, setBlocks] = useState(initialBlocks || []);
  const [selectedIdx, setSelectedIdx] = useState(null);

  useEffect(() => { if (onSave) onSave(blocks); }, [blocks]);

  const addBlock = (type) => {
    const def = getBlock(type);
    const config = {};
    for (const f of def.configFields) {
      if (f.default !== undefined) config[f.key] = f.default;
    }
    setBlocks([...blocks, { type, config }]);
    setSelectedIdx(blocks.length);
  };

  const removeBlock = (idx) => {
    setBlocks(blocks.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const moveBlock = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const copy = [...blocks];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setBlocks(copy);
    setSelectedIdx(newIdx);
  };

  const updateConfig = (idx, key, value) => {
    setBlocks(blocks.map((b, i) => i === idx ? { ...b, config: { ...b.config, [key]: value } } : b));
  };

  const selectedBlock = selectedIdx !== null ? blocks[selectedIdx] : null;
  const selectedDef = selectedBlock ? getBlock(selectedBlock.type) : null;

  // Get columns for a selected table (from blocks earlier in pipeline)
  const getAvailableColumns = () => {
    // Find first data_source block's table
    for (const b of blocks) {
      if (b.type === "data_source" && b.config?.table) {
        const t = tables.find((t) => t.name === b.config.table);
        if (t) {
          const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
          return ["id", ...cols.map((c) => c.name), "created_at"];
        }
      }
    }
    return [];
  };

  const columns = getAvailableColumns();

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
      {/* Block Palette */}
      <div style={{ width: 180, flexShrink: 0 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Blocks</h3>
        {CATEGORIES.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>{cat.label}</div>
            {BLOCK_CATALOG.filter((b) => b.category === cat.id).map((b) => (
              <button key={b.type} onClick={() => addBlock(b.type)} style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 8px",
                background: "#fff", border: `1px solid ${cat.color}30`, borderLeft: `3px solid ${cat.color}`,
                borderRadius: 4, cursor: "pointer", fontSize: 12, marginBottom: 4, textAlign: "left",
              }}>
                <span>{b.icon}</span> {b.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Pipeline</h3>
          {onRun && (
            <button onClick={() => onRun(blocks)} style={{
              padding: "6px 16px", background: "#38a169", color: "#fff", border: "none",
              borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>
              Run
            </button>
          )}
        </div>

        {blocks.length === 0 ? (
          <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "2px dashed #ddd", textAlign: "center", color: "#999", fontSize: 13 }}>
            Add blocks from the palette to build your pipeline
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {blocks.map((block, i) => {
              const def = getBlock(block.type);
              const cat = CATEGORIES.find((c) => c.id === def.category);
              const isSelected = selectedIdx === i;
              return (
                <div key={i}>
                  <div onClick={() => setSelectedIdx(i)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", background: isSelected ? `${cat.color}15` : "#fff",
                    border: isSelected ? `2px solid ${cat.color}` : "1px solid #e2e8f0",
                    borderRadius: 6, cursor: "pointer",
                    borderLeft: `4px solid ${cat.color}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{def.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>
                          {Object.entries(block.config || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "not configured"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={(e) => { e.stopPropagation(); moveBlock(i, -1); }} style={miniBtn}>&uarr;</button>
                      <button onClick={(e) => { e.stopPropagation(); moveBlock(i, 1); }} style={miniBtn}>&darr;</button>
                      <button onClick={(e) => { e.stopPropagation(); removeBlock(i); }} style={{ ...miniBtn, color: "#e53e3e" }}>x</button>
                    </div>
                  </div>
                  {i < blocks.length - 1 && (
                    <div style={{ textAlign: "center", color: "#ccc", fontSize: 16, lineHeight: "20px" }}>&darr;</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Run Results */}
        {runResults && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Results</h3>
            {runResults.map((r, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                {r.type === "chart" && <ChartResult data={r} />}
                {r.type === "table_output" && <TableResult data={r} />}
                {r.type === "stat_output" && <StatResult data={r} />}
                {!["chart", "table_output", "stat_output"].includes(r.type) && (
                  <div style={{ fontSize: 12, color: "#666", padding: 8, background: "#f7f7f7", borderRadius: 4 }}>
                    {r.type}: {r.rows != null ? `${r.rows} rows` : r.error || r.message || "done"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config Panel */}
      {selectedBlock && selectedDef && (
        <div style={{ width: 250, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16, flexShrink: 0, alignSelf: "flex-start" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>{selectedDef.icon} {selectedDef.label}</h3>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: "#666" }}>{selectedDef.description}</p>
          {selectedDef.configFields.map((field) => (
            <label key={field.key} style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 8 }}>
              {field.label}
              {field.type === "text" && (
                <input value={selectedBlock.config?.[field.key] || ""} onChange={(e) => updateConfig(selectedIdx, field.key, e.target.value)}
                  style={cfgInput} />
              )}
              {field.type === "number" && (
                <input type="number" value={selectedBlock.config?.[field.key] || field.default || ""} onChange={(e) => updateConfig(selectedIdx, field.key, parseInt(e.target.value) || 0)}
                  style={cfgInput} />
              )}
              {field.type === "select" && (
                <select value={selectedBlock.config?.[field.key] || ""} onChange={(e) => updateConfig(selectedIdx, field.key, e.target.value)} style={cfgInput}>
                  <option value="">Select...</option>
                  {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {field.type === "table_select" && (
                <select value={selectedBlock.config?.[field.key] || ""} onChange={(e) => updateConfig(selectedIdx, field.key, e.target.value)} style={cfgInput}>
                  <option value="">Select table...</option>
                  {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              )}
              {field.type === "column_select" && (
                <select value={selectedBlock.config?.[field.key] || ""} onChange={(e) => updateConfig(selectedIdx, field.key, e.target.value)} style={cfgInput}>
                  <option value="">Select column...</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple result renderers
function ChartResult({ data }) {
  const max = Math.max(...data.values, 1);
  const h = 140;
  return (
    <div style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
      {data.title && <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>{data.title}</h4>}
      <svg width="100%" height={h + 30} viewBox={`0 0 ${Math.max(data.values.length * 50, 200)} ${h + 30}`}>
        {data.chart_type === "line" ? (
          <polyline points={data.values.map((v, i) => `${i * 50 + 25},${h - (v / max) * h}`).join(" ")} fill="none" stroke="#0070f3" strokeWidth={2} />
        ) : (
          data.values.map((v, i) => (
            <g key={i}>
              <rect x={i * 50 + 5} y={h - (v / max) * h} width={40} height={(v / max) * h} fill="#0070f3" rx={3} />
              <text x={i * 50 + 25} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels[i]).slice(0, 8)}</text>
            </g>
          ))
        )}
      </svg>
    </div>
  );
}

function TableResult({ data }) {
  return (
    <div style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", overflow: "auto" }}>
      {data.title && <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>{data.title}</h4>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>{data.columns.map((c) => <th key={c} style={{ border: "1px solid #eee", padding: 4, background: "#f9fafb" }}>{c}</th>)}</tr></thead>
        <tbody>{data.rows.map((r, i) => <tr key={i}>{data.columns.map((c) => <td key={c} style={{ border: "1px solid #eee", padding: 4 }}>{r[c] != null ? String(r[c]) : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function StatResult({ data }) {
  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{data.label}</div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{data.value}</div>
    </div>
  );
}

const miniBtn = { padding: "2px 6px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "#666" };
const cfgInput = { display: "block", width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
