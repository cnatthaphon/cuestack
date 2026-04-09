"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { BLOCK_CATALOG, CATEGORIES, getBlock, getConfigSummary, getAllBlocks, loadOrgBlocks, isOrgBlocksLoaded } from '../flow-blocks.js';

// ─── Node type definitions (driven by shared block registry + org custom) ────
function buildNodeTypes() {
  return getAllBlocks().map(b => ({
    id: b.type,
    label: b.label,
    icon: b.icon,
    color: b.color,
    inputs: b.inputs.length,
    outputs: b.outputs.length,
    category: CATEGORIES.find(c => c.id === b.category)?.label || b.category,
    _custom: !!b._custom,
  }));
}

// Initial node types (system blocks only — org blocks loaded async)
let NODE_TYPES = buildNodeTypes();

const NODE_W = 180;
const NODE_H = 56;
const PORT_R = 7;

// ─── Main canvas component ───────────────────────────────────────────────────
export default function FlowCanvas({ nodes: initNodes, edges: initEdges, tables, onSave, onRun, runResult, readOnly }) {
  const [nodes, setNodes] = useState(initNodes || []);
  const [edges, setEdges] = useState(initEdges || []);
  const [selected, setSelected] = useState(null); // node id
  const [connecting, setConnecting] = useState(null); // {nodeId, port: "out", portIdx}
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null); // {nodeId, offsetX, offsetY}
  const [showCatalog, setShowCatalog] = useState(false);
  const svgRef = useRef(null);

  const [nodeTypes, setNodeTypes] = useState(NODE_TYPES);

  // Load org custom blocks on mount
  useEffect(() => {
    if (!isOrgBlocksLoaded()) {
      loadOrgBlocks().then(() => {
        NODE_TYPES = buildNodeTypes();
        setNodeTypes(NODE_TYPES);
      });
    }
  }, []);

  // Sync with parent
  useEffect(() => { setNodes(initNodes || []); }, [initNodes]);
  useEffect(() => { setEdges(initEdges || []); }, [initEdges]);

  // ─── Node operations ──────────────────────────────────────────────────────
  const addNode = (typeId, x, y) => {
    const nt = nodeTypes.find((t) => t.id === typeId);
    if (!nt) return;
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const config = {};
    if (typeId === "data_source") config.limit = 100;
    if (typeId === "generate") { config.count = 5; config.fields = {}; }
    if (typeId === "filter") config.operator = "=";
    if (typeId === "aggregate") config.aggregation = "count";
    if (typeId === "output") config.format = "table";
    if (typeId === "notify") config.type = "info";
    setNodes((prev) => [...prev, { id, type: typeId, x: x || 100 + prev.length * 40, y: y || 80 + prev.length * 80, config }]);
    setShowCatalog(false);
    setSelected(id);
  };

  const removeNode = (nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    if (selected === nodeId) setSelected(null);
  };

  const updateNodeConfig = (nodeId, key, val) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, config: { ...n.config, [key]: val } } : n));
  };

  // ─── Mouse handlers ───────────────────────────────────────────────────────
  const getSVGPoint = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y };
  };

  const onMouseMove = (e) => {
    const pt = getSVGPoint(e);
    setMousePos(pt);
    if (dragging) {
      setNodes((prev) => prev.map((n) => n.id === dragging.nodeId
        ? { ...n, x: pt.x - dragging.offsetX, y: pt.y - dragging.offsetY } : n));
    }
  };

  const onMouseUp = () => {
    if (dragging) setDragging(null);
  };

  const onNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const pt = getSVGPoint(e);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDragging({ nodeId, offsetX: pt.x - node.x, offsetY: pt.y - node.y });
    setSelected(nodeId);
  };

  // ─── Port positions ───────────────────────────────────────────────────────
  const getInputPort = (node, idx, total) => {
    const spacing = NODE_W / (total + 1);
    return { x: node.x + spacing * (idx + 1), y: node.y };
  };

  const getOutputPort = (node, idx, total) => {
    const spacing = NODE_W / (total + 1);
    return { x: node.x + spacing * (idx + 1), y: node.y + NODE_H };
  };

  // ─── Connection handling ──────────────────────────────────────────────────
  const startConnect = (e, nodeId, portType, portIdx) => {
    e.stopPropagation();
    setConnecting({ nodeId, portType, portIdx });
  };

  const endConnect = (e, nodeId, portType, portIdx) => {
    e.stopPropagation();
    if (!connecting) return;
    // Must connect output → input
    if (connecting.portType === "out" && portType === "in" && connecting.nodeId !== nodeId) {
      const newEdge = { from: connecting.nodeId, fromPort: connecting.portIdx, to: nodeId, toPort: portIdx };
      // No duplicate edges
      if (!edges.some((ed) => ed.from === newEdge.from && ed.to === newEdge.to && ed.toPort === newEdge.toPort)) {
        setEdges((prev) => [...prev, newEdge]);
      }
    }
    setConnecting(null);
  };

  const removeEdge = (idx) => setEdges((prev) => prev.filter((_, i) => i !== idx));

  // ─── Canvas click (deselect or finish connect) ────────────────────────────
  const onCanvasClick = (e) => {
    if (connecting) { setConnecting(null); return; }
    if (e.target === svgRef.current || e.target.classList.contains("canvas-bg")) {
      setSelected(null);
    }
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (onSave) onSave(nodes, edges);
  };

  const handleRun = () => {
    // Convert graph to linear block list via topological sort
    const blockList = topologicalSort(nodes, edges);
    if (onRun) onRun(blockList);
  };

  // ─── Get node result from runResult ───────────────────────────────────────
  const getNodeResult = (nodeId) => {
    if (!runResult?.results) return null;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const nodeIdx = topologicalSort(nodes, edges).findIndex((b) => b._nodeId === nodeId);
    return runResult.results[nodeIdx];
  };

  // ─── Get source columns (from first connected data_source) ────────────────
  const getSourceCols = (nodeId) => {
    // Walk backwards through edges to find a data_source
    const visited = new Set();
    const queue = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = nodes.find((n) => n.id === cur);
      if (node?.type === "data_source" && node.config?.table) {
        const t = tables?.find((t) => t.name === node.config.table);
        if (t) {
          const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
          return ["id", ...cols.map((c) => c.name), "created_at"];
        }
      }
      // Find upstream nodes
      for (const edge of edges) {
        if (edge.to === cur) queue.push(edge.from);
      }
    }
    return [];
  };

  const selectedNode = nodes.find((n) => n.id === selected);

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", background: "#fafafa", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, display: "flex", gap: 4 }}>
          {!readOnly && (
            <button onClick={() => setShowCatalog(!showCatalog)} style={canvasBtn}>+ Add Node</button>
          )}
          {!readOnly && <button onClick={handleSave} style={canvasBtn}>Save</button>}
          <button onClick={handleRun} disabled={nodes.length === 0} style={{ ...canvasBtn, color: "#059669", borderColor: "#059669" }}>{"\u25B6"} Run</button>
          <span style={{ fontSize: 11, color: "#999", padding: "6px 8px" }}>{nodes.length} nodes, {edges.length} connections</span>
        </div>

        {/* Node catalog dropdown */}
        {showCatalog && (
          <div style={{ position: "absolute", top: 40, left: 8, zIndex: 20, background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", width: 200 }}>
            {[...new Set(nodeTypes.map(t => t.category))].map((cat) => (
              <div key={cat}>
                <div style={{ fontSize: 10, color: "#999", padding: "4px 8px", textTransform: "uppercase" }}>{cat}</div>
                {nodeTypes.filter((t) => t.category === cat).map((t) => (
                  <button key={t.id} onClick={() => addNode(t.id, 200 + Math.random() * 200, 100 + Math.random() * 200)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", background: "none", border: "none", cursor: "pointer", fontSize: 12, borderRadius: 4, textAlign: "left" }}
                    onMouseEnter={(e) => e.target.style.background = "#f0f0f0"} onMouseLeave={(e) => e.target.style.background = "none"}>
                    <span style={{ width: 20, textAlign: "center" }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* SVG Canvas */}
        <svg ref={svgRef} width="100%" height="100%" onClick={onCanvasClick} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
          style={{ cursor: dragging ? "grabbing" : connecting ? "crosshair" : "default" }}>
          {/* Grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#eee" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect className="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x},${pan.y})`}>
            {/* Edges */}
            {edges.map((edge, i) => {
              const fromNode = nodes.find((n) => n.id === edge.from);
              const toNode = nodes.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              const fromNT = nodeTypes.find((t) => t.id === fromNode.type);
              const toNT = nodeTypes.find((t) => t.id === toNode.type);
              const from = getOutputPort(fromNode, edge.fromPort || 0, fromNT?.outputs || 1);
              const to = getInputPort(toNode, edge.toPort || 0, toNT?.inputs || 1);
              const midY = (from.y + to.y) / 2;
              return (
                <g key={i}>
                  <path d={`M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
                    fill="none" stroke="#94a3b8" strokeWidth={2} />
                  {/* Click to delete edge */}
                  {!readOnly && (
                    <path d={`M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
                      fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); removeEdge(i); }} />
                  )}
                  {/* Arrow */}
                  <polygon points={`${to.x},${to.y} ${to.x - 4},${to.y - 8} ${to.x + 4},${to.y - 8}`} fill="#94a3b8" />
                </g>
              );
            })}

            {/* Connecting wire (in progress) */}
            {connecting && (() => {
              const fromNode = nodes.find((n) => n.id === connecting.nodeId);
              if (!fromNode) return null;
              const fromNT = nodeTypes.find((t) => t.id === fromNode.type);
              const from = connecting.portType === "out"
                ? getOutputPort(fromNode, connecting.portIdx, fromNT?.outputs || 1)
                : getInputPort(fromNode, connecting.portIdx, fromNT?.inputs || 1);
              const midY = (from.y + mousePos.y) / 2;
              return <path d={`M${from.x},${from.y} C${from.x},${midY} ${mousePos.x},${midY} ${mousePos.x},${mousePos.y}`}
                fill="none" stroke="#0070f3" strokeWidth={2} strokeDasharray="6,3" />;
            })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const nt = nodeTypes.find((t) => t.id === node.type) || nodeTypes[0];
              const isSel = selected === node.id;
              const result = getNodeResult(node.id);
              return (
                <g key={node.id}>
                  {/* Node body */}
                  <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8}
                    fill="#fff" stroke={isSel ? nt.color : "#d1d5db"} strokeWidth={isSel ? 2.5 : 1.5}
                    style={{ cursor: readOnly ? "default" : "grab", filter: isSel ? "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" : "none" }}
                    onMouseDown={(e) => !readOnly && onNodeMouseDown(e, node.id)} />
                  {/* Color accent */}
                  <rect x={node.x} y={node.y} width={4} height={NODE_H} rx={2} fill={nt.color} style={{ pointerEvents: "none" }} />
                  {/* Icon + label — pointerEvents none so clicks pass to background rect */}
                  <text x={node.x + 14} y={node.y + 22} fontSize={14} style={{ pointerEvents: "none" }}>{nt.icon}</text>
                  <text x={node.x + 32} y={node.y + 22} fontSize={11} fontWeight={600} fill="#333" style={{ pointerEvents: "none" }}>{nt.label}</text>
                  {/* Config summary */}
                  <text x={node.x + 32} y={node.y + 38} fontSize={9} fill="#999" style={{ pointerEvents: "none" }}>
                    {getConfigSummary(node)}
                  </text>
                  {/* Result badge */}
                  {result && (
                    <g>
                      <rect x={node.x + NODE_W - 50} y={node.y + 4} width={44} height={16} rx={8}
                        fill={result.error ? "#fef2f2" : "#f0fde8"} />
                      <text x={node.x + NODE_W - 28} y={node.y + 15} fontSize={8} textAnchor="middle"
                        fill={result.error ? "#e53e3e" : "#38a169"}>
                        {result.error ? "ERR" : result.rows ? `${result.rows.length}r` : result.value !== undefined ? result.value : "OK"}
                      </text>
                    </g>
                  )}
                  {/* Delete button */}
                  {isSel && !readOnly && (
                    <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}>
                      <circle cx={node.x + NODE_W - 6} cy={node.y - 6} r={8} fill="#e53e3e" />
                      <text x={node.x + NODE_W - 6} y={node.y - 2} fontSize={10} fill="#fff" textAnchor="middle">x</text>
                    </g>
                  )}
                  {/* Input ports */}
                  {Array.from({ length: nt.inputs }).map((_, pi) => {
                    const pt = getInputPort(node, pi, nt.inputs);
                    return (
                      <circle key={`in-${pi}`} cx={pt.x} cy={pt.y} r={PORT_R}
                        fill={connecting ? "#0070f3" : "#fff"} stroke={nt.color} strokeWidth={2}
                        style={{ cursor: "pointer" }}
                        onMouseDown={(e) => !readOnly && startConnect(e, node.id, "in", pi)}
                        onMouseUp={(e) => !readOnly && endConnect(e, node.id, "in", pi)} />
                    );
                  })}
                  {/* Output ports */}
                  {Array.from({ length: nt.outputs }).map((_, pi) => {
                    const pt = getOutputPort(node, pi, nt.outputs);
                    return (
                      <circle key={`out-${pi}`} cx={pt.x} cy={pt.y} r={PORT_R}
                        fill={connecting ? "#fff" : "#fff"} stroke={nt.color} strokeWidth={2}
                        style={{ cursor: "pointer" }}
                        onMouseDown={(e) => !readOnly && startConnect(e, node.id, "out", pi)}
                        onMouseUp={(e) => !readOnly && endConnect(e, node.id, "out", pi)} />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Properties panel */}
      <div style={{ width: 260, background: "#fff", borderRadius: "0 8px 8px 0", border: "1px solid #e2e8f0", borderLeft: "none", overflow: "auto", fontSize: 12 }}>
        {selectedNode ? (
          <NodeProperties node={selectedNode} tables={tables} readOnly={readOnly}
            sourceCols={getSourceCols(selectedNode.id)}
            onUpdate={(key, val) => updateNodeConfig(selectedNode.id, key, val)}
            result={getNodeResult(selectedNode.id)} />
        ) : (
          <div style={{ padding: 16, color: "#999", textAlign: "center" }}>
            <p style={{ fontSize: 13, margin: "16px 0 8px" }}>Select a node to configure</p>
            <p style={{ fontSize: 11 }}>Drag output port → input port to connect</p>
            <p style={{ fontSize: 11 }}>Click a wire to delete it</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Node properties panel (registry-driven) ────────────────────────────────
function NodeProperties({ node, tables, sourceCols, onUpdate, result, readOnly }) {
  const nt = NODE_TYPES.find((t) => t.id === node.type);
  const block = getBlock(node.type);
  const cfg = node.config || {};

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{nt?.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: nt?.color }}>{nt?.label}</div>
          <div style={{ fontSize: 10, color: "#999" }}>{node.id.slice(0, 16)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {block?.configSchema?.map((field) => {
          const value = cfg[field.key] ?? field.default ?? '';
          const key = field.key;

          if (field.type === 'table-select') {
            const tableList = tables || [];
            const hasCurrentValue = value && tableList.some(t => t.name === value);
            return (
              <Field key={key} label={field.label}>
                <select value={value} onChange={(e) => onUpdate(key, e.target.value)} disabled={readOnly} style={propInput}>
                  <option value="">Select table...</option>
                  {/* Show saved value even if tables haven't loaded */}
                  {value && !hasCurrentValue && <option value={value}>{value}</option>}
                  {tableList.map((t) => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}
                </select>
              </Field>
            );
          }

          if (field.type === 'select') {
            return (
              <Field key={key} label={field.label}>
                <select value={value} onChange={(e) => onUpdate(key, e.target.value)} disabled={readOnly} style={propInput}>
                  {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            );
          }

          if (field.type === 'number') {
            return (
              <Field key={key} label={field.label}>
                <input type="number" value={value} min={field.min} max={field.max}
                  onChange={(e) => onUpdate(key, Number(e.target.value))} disabled={readOnly} style={propInput} />
              </Field>
            );
          }

          if (field.type === 'column-mapping') {
            // Parse text value into structured rows
            const mappingRows = (value || '').split('\n').filter(l => l.trim()).map(line => {
              const parts = line.split('->').map(s => s.trim());
              return { source: parts[0] || '', target: parts[1] || parts[0] || '' };
            });
            const serializeMappings = (rows) => rows.map(r => r.source + ' -> ' + r.target).join('\n');
            const updateRow = (idx, field, val) => {
              const rows = [...mappingRows];
              rows[idx] = { ...rows[idx], [field]: val };
              onUpdate(key, serializeMappings(rows));
            };
            const deleteRow = (idx) => {
              const rows = mappingRows.filter((_, i) => i !== idx);
              onUpdate(key, serializeMappings(rows));
            };
            const addRow = () => {
              const newSource = sourceCols && sourceCols.length > 0 ? sourceCols[0] : '';
              const rows = [...mappingRows, { source: newSource, target: newSource }];
              onUpdate(key, serializeMappings(rows));
            };
            const rowInputStyle = { ...propInput, flex: 1, fontSize: 10, fontFamily: 'monospace', padding: '3px 6px' };
            const selectStyle = { ...propInput, flex: 1, fontSize: 10, fontFamily: 'monospace', padding: '3px 4px' };
            return (
              <Field key={key} label={field.label}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {mappingRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {sourceCols && sourceCols.length > 0 ? (
                        <select value={row.source} disabled={readOnly} style={selectStyle}
                          onChange={(e) => updateRow(idx, 'source', e.target.value)}>
                          {!sourceCols.includes(row.source) && row.source && <option value={row.source}>{row.source}</option>}
                          {sourceCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={row.source} disabled={readOnly} style={rowInputStyle}
                          placeholder="source" onChange={(e) => updateRow(idx, 'source', e.target.value)} />
                      )}
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{'\u2192'}</span>
                      <input type="text" value={row.target} disabled={readOnly} style={rowInputStyle}
                        placeholder="target" onChange={(e) => updateRow(idx, 'target', e.target.value)} />
                      {!readOnly && (
                        <button onClick={() => deleteRow(idx)}
                          style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                          title="Remove mapping">{'\u00d7'}</button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button onClick={addRow}
                      style={{ background: '#f7f8fa', border: '1px dashed #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#2563eb', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 2 }}>
                      + Add Mapping
                    </button>
                  )}
                </div>
                {field.help && <span style={{ fontSize: 9, color: '#999', marginTop: 2, display: 'block' }}>{field.help}</span>}
              </Field>
            );
          }

          if (field.type === 'code') {
            return (
              <Field key={key} label={field.label}>
                <textarea value={value} rows={field.rows || 8}
                  onChange={(e) => onUpdate(key, e.target.value)} disabled={readOnly}
                  style={{ ...propInput, fontFamily: "monospace", fontSize: 10, minHeight: 120, resize: "vertical" }} />
              </Field>
            );
          }

          // Default: text input (also handles multi-text)
          // For "column" fields, show a dropdown when sourceCols are available
          if (key === 'column' && sourceCols && sourceCols.length > 0) {
            return (
              <Field key={key} label={field.label}>
                <select value={value} onChange={(e) => onUpdate(key, e.target.value)} disabled={readOnly} style={propInput}>
                  <option value="">-- select column --</option>
                  {!sourceCols.includes(value) && value && <option value={value}>{value}</option>}
                  {sourceCols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {field.help && <span style={{ fontSize: 9, color: '#999' }}>{field.help}</span>}
              </Field>
            );
          }
          return (
            <Field key={key} label={field.label}>
              <input type="text" value={value} placeholder={field.placeholder || ''}
                onChange={(e) => onUpdate(key, e.target.value)} disabled={readOnly} style={propInput} />
              {field.help && <span style={{ fontSize: 9, color: '#999' }}>{field.help}</span>}
            </Field>
          );
        })}
      </div>

      {/* Description from registry */}
      {block?.description && (
        <div style={{ fontSize: 10, color: "#999", padding: "8px 0 0" }}>{block.description}</div>
      )}

      {/* Result preview */}
      {result && (
        <div style={{ marginTop: 12, padding: 8, background: result.error ? "#fef2f2" : "#f0fde8", borderRadius: 6, fontSize: 11 }}>
          <strong>{result.error ? "Error" : "Result"}</strong>
          <div style={{ marginTop: 4, color: result.error ? "#e53e3e" : "#333" }}>
            {result.error || result.message || ""}
            {result.value !== undefined && <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{result.value}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: "#666", marginBottom: 2 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Topological sort (convert graph to execution order) ──────────────────────
function topologicalSort(nodes, edges) {
  const inDeg = {};
  const adj = {};
  for (const n of nodes) { inDeg[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
    if (inDeg[e.to] !== undefined) inDeg[e.to]++;
  }

  const queue = nodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  const order = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    order.push(cur);
    for (const next of (adj[cur] || [])) {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    }
  }

  // Convert to block list for execution
  return order.map((id) => {
    const node = nodes.find((n) => n.id === id);
    return { type: node.type, config: node.config || {}, _nodeId: node.id };
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const canvasBtn = { padding: "5px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 };
const propInput = { width: "100%", padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12, boxSizing: "border-box" };
