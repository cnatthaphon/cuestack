"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ChartWidget from "./chart-widget.js";

/**
 * Energy Intelligence Widget — self-contained mini-app.
 *
 * Everything happens within this widget:
 * - Settings: data source, tariff, schedule, alerts, gamification
 * - Training: select models, train, compare, activate
 * - Monitoring: actual vs predicted, bins, savings, badges, alerts
 * - Calibration: percentile slider, bin adjustments
 *
 * No external pages needed. Config stored in widget JSON.
 */

const MODEL_TYPES = [
  { id: "linear_regression", name: "Linear Regression" },
  { id: "random_forest", name: "Random Forest" },
  { id: "xgboost", name: "XGBoost" },
  { id: "ensemble", name: "Ensemble (Voting)" },
];

const BADGE_ICONS = {
  perfectDay: "\u2B50", streak3: "\uD83D\uDD25", streak7: "\uD83C\uDF1F",
  morningWinner: "\u2600\uFE0F", afternoonWinner: "\uD83C\uDF24\uFE0F",
  eveningWinner: "\uD83C\uDF19", demandDefender: "\uD83D\uDEE1\uFE0F",
};

export default function EnergyIntelligenceWidget({ config, onSaveConfig }) {
  const [tab, setTab] = useState("monitor"); // monitor | settings | train
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState("bar"); // bar | line (24h)
  const [selectedDay, setSelectedDay] = useState(null); // date string for 24h drill-down

  // Settings (stored in config, editable inline)
  const [settings, setSettings] = useState({
    source_table: config?.source_table || "",
    target_column: config?.target_column || "power_w",
    model_config: config?.model_config || {},
    tariff: {
      onpeak_rate: 4.1839, offpeak_rate: 2.6037, demand_charge: 132.93,
      onpeak_start: 9, onpeak_end: 22, onpeak_days: [1, 2, 3, 4, 5],
      ...(config?.tariff || {}),
    },
    schedule: {
      operating_start: 8, operating_end: 22, operating_days: [1, 2, 3, 4, 5],
      ...(config?.schedule || {}),
    },
    alerts: {
      energy_alert_pct: 5, peak_alert_pct: 80, demand_budget_kw: 5.0,
      ...(config?.alerts || {}),
    },
    gamification: {
      target_reduction: 10, enabled: true,
      ...(config?.gamification || {}),
    },
    percentile: config?.percentile || 50,
    output_table: config?.output_table || "energy_predictions",
  });

  // Training state
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState(null);
  const [models, setModels] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState([]);
  const [trainConfig, setTrainConfig] = useState({
    model_types: ["linear_regression", "random_forest", "xgboost", "ensemble"],
    feature_columns: [],
    training_interval: "hourly",
  });

  // Load tables + models on mount
  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || [])).catch(() => {});
    fetch("/api/dashboards/train").then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, []);

  // Load columns when source table changes
  useEffect(() => {
    if (!settings.source_table) { setColumns([]); return; }
    const t = tables.find((t) => t.name === settings.source_table);
    if (t) {
      const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
      setColumns(cols.map((c) => c.name));
    }
  }, [settings.source_table, tables]);

  // Run monitoring analysis
  const runMonitor = useCallback(async () => {
    if (!settings.source_table || Object.keys(settings.model_config).length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboards/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: "energy_monitor",
          model_config: settings.model_config,
          inputs: {
            setpoint: 24,
            percentile: settings.percentile,
            ...settings.tariff,
            ...settings.schedule,
            ...settings.alerts,
          },
          source_table: settings.source_table,
          output_table: settings.output_table,
        }),
      });
      const d = await res.json();
      setResult(d.data);
      if (d.error) setError(d.error);
      else setError(null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [settings]);

  useEffect(() => { runMonitor(); }, [settings.source_table, settings.percentile, settings.model_config]);

  // Train models
  const runTraining = async () => {
    setTraining(true); setTrainResult(null);
    try {
      const res = await fetch("/api/dashboards/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_table: settings.source_table,
          target_column: settings.target_column,
          feature_columns: trainConfig.feature_columns,
          model_types: trainConfig.model_types,
          training_interval: trainConfig.training_interval,
        }),
      });
      const d = await res.json();
      setTrainResult(d.data || d);
      if (d.data?.status === "success") {
        fetch("/api/dashboards/train").then((r) => r.json()).then((d) => setModels(d.models || []));
        // Persist training config to widget
        if (onSaveConfig) onSaveConfig({ ...settings, last_trained: new Date().toISOString() });
      }
    } catch (e) { setError(e.message); }
    setTraining(false);
  };

  const updateSetting = (path, value) => {
    setSettings((prev) => {
      const next = { ...prev };
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  };

  // Styles
  const cs = { background: "#f8fafc", borderRadius: 6, padding: "8px 12px", textAlign: "center" };
  const ls = { fontSize: 9, color: "#64748b", textTransform: "uppercase", marginBottom: 2 };
  const vs = { fontSize: 20, fontWeight: 700, color: "#1e293b" };
  const us = { fontSize: 10, fontWeight: 400, color: "#94a3b8", marginLeft: 2 };
  const tabBtn = (id) => ({
    padding: "6px 14px", fontSize: 12, fontWeight: tab === id ? 600 : 400, cursor: "pointer", border: "none",
    borderBottom: tab === id ? "2px solid #3b82f6" : "2px solid transparent",
    background: "transparent", color: tab === id ? "#1e293b" : "#94a3b8",
  });
  const inp = { padding: "5px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12, width: "100%", boxSizing: "border-box" };
  const label = { fontSize: 11, color: "#555", fontWeight: 600, marginBottom: 2, display: "block" };

  const activeModel = models.find((m) => m.is_active === true || m.is_active === "true");

  // ─── No source configured ────────────────────────────────────────────────
  if (!settings.source_table && tab === "monitor") {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Energy Intelligence</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>Configure data source and train a model to start monitoring.</div>
        <button onClick={() => setTab("settings")} style={{ padding: "8px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          Configure
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", gap: 0 }}>
        <button onClick={() => setTab("monitor")} style={tabBtn("monitor")}>Monitor</button>
        <button onClick={() => setTab("train")} style={tabBtn("train")}>Train</button>
        <button onClick={() => setTab("settings")} style={tabBtn("settings")}>Settings</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#94a3b8" }}>
          {activeModel && <span>{activeModel.name} (R²={(() => { try { const a = typeof activeModel.accuracy === "string" ? JSON.parse(activeModel.accuracy) : activeModel.accuracy; return a.r2; } catch { return "?"; } })()})</span>}
          {loading && <span style={{ color: "#3b82f6" }}>Loading...</span>}
        </div>
      </div>

      {/* ─── MONITOR TAB ──────────────────────────────────────────────────── */}
      {tab === "monitor" && result?.summary && (() => {
        const s = result.summary;
        const gam = result.gamification || {};
        const alerts = result.alerts || [];
        const tBins = result.time_bins || {};
        const demand = result.demand || {};
        const daily = result.daily_stats || [];
        const statusColor = s.overall_status === "UNDER BUDGET" ? "#15803d" : "#dc2626";

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
            {/* Percentile calibration */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <span style={{ fontSize: 10, color: "#64748b", minWidth: 80 }}>Target p{settings.percentile}</span>
              <input type="range" min={10} max={90} value={settings.percentile}
                onChange={(e) => updateSetting("percentile", parseInt(e.target.value))}
                style={{ flex: 1, accentColor: "#3b82f6" }} />
              <button onClick={runMonitor} style={{ padding: "3px 10px", fontSize: 10, background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer" }}>Refresh</button>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              <div style={{ ...cs, borderLeft: `3px solid ${statusColor}` }}>
                <div style={ls}>Status</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{s.overall_status}</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>{s.total_days} days</div>
              </div>
              <div style={cs}>
                <div style={ls}>Savings</div>
                <div style={{ ...vs, fontSize: 16, color: s.savings_total_kWh >= 0 ? "#15803d" : "#dc2626" }}>{s.savings_total_kWh} kWh</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>{s.savings_cost_thb} THB</div>
              </div>
              <div style={cs}>
                <div style={ls}>Success</div>
                <div style={{ ...vs, fontSize: 16 }}>{s.success_rate}%</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>{s.days_under}/{s.total_days} under</div>
              </div>
              <div style={cs}>
                <div style={ls}>Cost</div>
                <div style={{ ...vs, fontSize: 16 }}>{s.actual_cost_thb}</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>THB ({s.tariff?.mode})</div>
              </div>
            </div>

            {/* Today's gauge + chart toggle */}
            <div style={{ display: "grid", gridTemplateColumns: result.today ? "140px 1fr" : "1fr", gap: 6 }}>
              {/* Today's gauge */}
              {result.today && (
                <div style={{ ...cs, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ ...ls, marginBottom: 4 }}>Today</div>
                  {(() => {
                    const t = result.today;
                    const pct = Math.min(t.progress_pct, 150);
                    const gaugeColor = pct <= 80 ? "#10b981" : pct <= 100 ? "#f59e0b" : "#ef4444";
                    const r = 40, cx = 50, cy = 48;
                    const angle = Math.PI + (Math.min(pct, 150) / 150) * Math.PI;
                    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
                    return (
                      <>
                        <svg viewBox="0 0 100 55" style={{ width: 100 }}>
                          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e5e7eb" strokeWidth={8} strokeLinecap="round" />
                          {pct > 0.5 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${pct > 75 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={gaugeColor} strokeWidth={8} strokeLinecap="round" />}
                          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">{Math.round(pct)}%</text>
                          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="7" fill="#94a3b8">of budget</text>
                        </svg>
                        <div style={{ fontSize: 9, color: "#64748b", textAlign: "center" }}>
                          {t.actual_kwh} / {t.predicted_kwh} kWh
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Chart: actual vs predicted (bar) or 24h line */}
              <div style={{ background: "#fff", borderRadius: 6, padding: 8, border: "1px solid #e5e7eb", minHeight: 140 }}>
                {/* Toggle bar/line + selected day */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => { setChartMode("bar"); setSelectedDay(null); }}
                      style={{ padding: "2px 8px", fontSize: 10, border: "1px solid #ddd", borderRadius: 3, cursor: "pointer",
                        background: chartMode === "bar" ? "#3b82f6" : "#fff", color: chartMode === "bar" ? "#fff" : "#666" }}>Daily</button>
                    <button onClick={() => setChartMode("line")}
                      style={{ padding: "2px 8px", fontSize: 10, border: "1px solid #ddd", borderRadius: 3, cursor: "pointer",
                        background: chartMode === "line" ? "#3b82f6" : "#fff", color: chartMode === "line" ? "#fff" : "#666" }}>24h</button>
                  </div>
                  {chartMode === "line" && (
                    <select value={selectedDay || ""} onChange={(e) => setSelectedDay(e.target.value || null)}
                      style={{ fontSize: 10, padding: "2px 6px", border: "1px solid #ddd", borderRadius: 3 }}>
                      {daily.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
                    </select>
                  )}
                </div>

                {chartMode === "bar" && result.chart && (
                  <ChartWidget config={{ chart_type: "bar", show_legend: true, y_label: "kWh" }} data={result.chart} />
                )}
                {chartMode === "line" && (() => {
                  const dayKey = selectedDay || daily[daily.length - 1]?.date;
                  const hourly = result.hourly_by_day?.[dayKey];
                  if (!hourly) return <div style={{ color: "#94a3b8", fontSize: 11 }}>No hourly data</div>;
                  return <ChartWidget config={{ chart_type: "line", show_legend: false, x_label: "Hour", y_label: "kWh", title: dayKey }}
                    data={{ labels: hourly.labels, series: [{ label: "Power (kWh)", values: hourly.values, color: "#3b82f6" }] }} />;
                })()}
              </div>
            </div>

            {/* Bins + Demand */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {Object.values(tBins).map((b) => (
                <div key={b.label} style={{ ...cs, padding: "6px 8px" }}>
                  <div style={{ ...ls, fontSize: 8 }}>{b.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{b.kwh} kWh</div>
                  <div style={{ fontSize: 9, color: "#94a3b8" }}>{b.cost_thb} THB · {b.rate} THB/kWh</div>
                </div>
              ))}
              {(result.power_bins || []).map((b) => (
                <div key={b.label} style={{ ...cs, padding: "6px 8px" }}>
                  <div style={{ ...ls, fontSize: 8 }}>{b.label} ({b.range})</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{b.kwh} kWh</div>
                  <div style={{ fontSize: 9, color: "#94a3b8" }}>{b.count} readings</div>
                </div>
              ))}
              <div style={{ ...cs, padding: "6px 8px", borderLeft: `3px solid ${demand.status === "OK" ? "#10b981" : "#ef4444"}` }}>
                <div style={{ ...ls, fontSize: 8 }}>Demand Peak</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{demand.peak_kw} kW</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>Budget: {demand.budget_kw} kW</div>
              </div>
            </div>

            {/* Gamification */}
            {gam.total_badges > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ ...cs, textAlign: "left" }}>
                  <div style={{ ...ls, marginBottom: 4 }}>Badges</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {Object.entries(gam.badge_counts || {}).map(([b, c]) => (
                      <span key={b} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
                        {BADGE_ICONS[b] || "\uD83C\uDFC5"} {b} x{c}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>Streak: {gam.current_streak} (best: {gam.max_streak})</div>
                </div>
                <div style={{ ...cs, textAlign: "left" }}>
                  <div style={{ ...ls, marginBottom: 4 }}>Leaderboard</div>
                  {(gam.leaderboard || []).slice(0, 3).map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "1px 0" }}>
                      <span>{i + 1}. {d.date}</span>
                      <span style={{ color: "#15803d", fontWeight: 600 }}>+{d.savings_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar heatmap */}
            {(gam.calendar || []).length > 0 && (
              <div style={cs}>
                <div style={{ ...ls, textAlign: "left" }}>Calendar</div>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {(gam.calendar || []).map((d) => (
                    <div key={d.date} title={`${d.date}: ${d.value > 0 ? "+" : ""}${d.value}%`}
                      style={{
                        width: 24, height: 24, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 7, fontWeight: 600,
                        background: d.status === "under" ? (d.value > 10 ? "#bbf7d0" : "#dcfce7") : (d.value < -10 ? "#fecaca" : "#fef2f2"),
                        color: d.status === "under" ? "#15803d" : "#dc2626",
                      }}>{d.date.slice(8)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <div style={{ ...cs, textAlign: "left", padding: "6px 10px" }}>
                <div style={ls}>Alerts</div>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 10 }}>
                    <span style={{ padding: "0 4px", borderRadius: 3, fontSize: 8, fontWeight: 600,
                      background: a.severity === "critical" ? "#fef2f2" : "#fffbeb",
                      color: a.severity === "critical" ? "#dc2626" : "#d97706" }}>{a.severity.toUpperCase()}</span>
                    <span style={{ color: "#334155" }}>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Daily stats table */}
            {daily.length > 0 && (
              <div style={{ overflow: "auto", maxHeight: 160 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead><tr style={{ background: "#f9fafb" }}>
                    {["Date", "Actual", "Predicted", "Savings", "Cost", "Te", "Peak", "Status"].map((h) => (
                      <th key={h} style={{ padding: 3, border: "1px solid #eee", fontSize: 9 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{daily.map((d) => (
                    <tr key={d.date}>
                      <td style={{ padding: 3, border: "1px solid #eee" }}>{d.date.slice(5)}</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right" }}>{d.actual_kwh}</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right" }}>{d.predicted_kwh}</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right", color: d.savings_kwh >= 0 ? "#15803d" : "#dc2626" }}>
                        {d.savings_kwh > 0 ? "+" : ""}{d.savings_kwh}
                      </td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right" }}>{d.actual_cost_thb}</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right" }}>{d.avg_te}°</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "right" }}>{d.peak_kw}kW</td>
                      <td style={{ padding: 3, border: "1px solid #eee", textAlign: "center" }}>
                        <span style={{ fontSize: 8, padding: "0 4px", borderRadius: 3, background: d.status === "under" ? "#f0fde8" : "#fef2f2", color: d.status === "under" ? "#15803d" : "#dc2626" }}>
                          {d.status === "under" ? "UNDER" : "OVER"}
                        </span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {tab === "monitor" && !result?.summary && !loading && (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
          {!settings.source_table ? "Configure data source in Settings tab" :
           Object.keys(settings.model_config).length === 0 ? "Train a model in the Train tab first" :
           error ? <span style={{ color: "#ef4444" }}>{error}</span> : "No data available"}
        </div>
      )}

      {/* ─── TRAIN TAB ────────────────────────────────────────────────────── */}
      {tab === "train" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", padding: "4px 0" }}>
          {/* Source + target */}
          <div>
            <div style={label}>Data Source</div>
            <div style={{ display: "flex", gap: 4 }}>
              <select value={settings.source_table} onChange={(e) => updateSetting("source_table", e.target.value)}
                style={{ ...inp, flex: 2 }}>
                <option value="">Select table...</option>
                {tables.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.row_count || 0} rows)</option>)}
              </select>
              <select value={trainConfig.training_interval} onChange={(e) => setTrainConfig({ ...trainConfig, training_interval: e.target.value })}
                style={{ ...inp, flex: 1 }}>
                <option value="15min">15-min</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
          </div>

          {columns.length > 0 && (
            <>
              <div>
                <div style={label}>Target Column</div>
                <select value={settings.target_column} onChange={(e) => updateSetting("target_column", e.target.value)} style={inp}>
                  <option value="">Select...</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <div style={label}>Features</div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {[...columns.filter((c) => c !== settings.target_column), "hour", "dow", "is_weekend", "delta_t"].map((c) => {
                    const isAuto = ["hour", "dow", "is_weekend", "delta_t"].includes(c);
                    return (
                      <label key={c} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, padding: "2px 6px",
                        background: trainConfig.feature_columns.includes(c) ? "#dbeafe" : isAuto ? "#f0fdf4" : "#f8fafc",
                        borderRadius: 4, border: `1px solid ${isAuto ? "#bbf7d0" : "#e2e8f0"}`, cursor: "pointer" }}>
                        <input type="checkbox" checked={trainConfig.feature_columns.includes(c)} style={{ width: 11, height: 11 }}
                          onChange={(e) => setTrainConfig((p) => ({
                            ...p, feature_columns: e.target.checked ? [...p.feature_columns, c] : p.feature_columns.filter((x) => x !== c),
                          }))} />
                        {c}{isAuto && <span style={{ fontSize: 8, color: "#16a34a" }}>auto</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Model types */}
          <div>
            <div style={label}>Models</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MODEL_TYPES.map((t) => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={trainConfig.model_types.includes(t.id)}
                    onChange={(e) => setTrainConfig((p) => ({
                      ...p, model_types: e.target.checked ? [...p.model_types, t.id] : p.model_types.filter((x) => x !== t.id),
                    }))} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          {/* Train button */}
          <button onClick={runTraining}
            disabled={training || !settings.source_table || !settings.target_column || trainConfig.model_types.length === 0}
            style={{ padding: "10px", background: !settings.source_table ? "#94a3b8" : "#2563eb", color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {training ? "Training..." : !settings.source_table ? "Select table first" : `Train ${trainConfig.model_types.length} Models`}
          </button>

          {/* Results */}
          {trainResult?.models && (
            <div style={{ background: "#f0fde8", borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Training Complete</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: 4, border: "1px solid #ddd", textAlign: "left" }}>Model</th>
                  <th style={{ padding: 4, border: "1px solid #ddd" }}>MAE</th>
                  <th style={{ padding: 4, border: "1px solid #ddd" }}>RMSE</th>
                  <th style={{ padding: 4, border: "1px solid #ddd" }}>R²</th>
                </tr></thead>
                <tbody>{trainResult.models.map((m) => (
                  <tr key={m.model_type} style={{ background: m.model_type === trainResult.best?.model_type ? "#dcfce7" : "transparent" }}>
                    <td style={{ padding: 4, border: "1px solid #ddd" }}>{m.name} {m.model_type === trainResult.best?.model_type && "\u2B50"}</td>
                    <td style={{ padding: 4, border: "1px solid #ddd", textAlign: "right" }}>{m.mae}</td>
                    <td style={{ padding: 4, border: "1px solid #ddd", textAlign: "right" }}>{m.rmse}</td>
                    <td style={{ padding: 4, border: "1px solid #ddd", textAlign: "right", fontWeight: 600 }}>{m.r2}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                {trainResult.training_rows} train / {trainResult.test_rows} test rows. Best model activated.
              </div>
            </div>
          )}

          {/* Existing models */}
          {models.length > 0 && (
            <div>
              <div style={label}>Trained Models ({models.length})</div>
              <div style={{ maxHeight: 120, overflow: "auto" }}>
                {models.map((m, i) => {
                  let acc = {}; try { acc = typeof m.accuracy === "string" ? JSON.parse(m.accuracy) : (m.accuracy || {}); } catch {}
                  const active = m.is_active === true || m.is_active === "true";
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "4px 6px", marginBottom: 2, borderRadius: 4, fontSize: 11,
                      background: active ? "#f0f9ff" : "#f8fafc", border: `1px solid ${active ? "#bae6fd" : "#e5e7eb"}` }}>
                      <span>{active && "\u2B50 "}{m.name}</span>
                      <span style={{ color: "#64748b" }}>R²={acc.r2 || "?"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB ─────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", padding: "4px 0" }}>
          {/* Data source */}
          <div>
            <div style={label}>Data Source Table</div>
            <select value={settings.source_table} onChange={(e) => updateSetting("source_table", e.target.value)} style={inp}>
              <option value="">Select table...</option>
              {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {/* Tariff */}
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 8 }}>
            <div style={{ ...label, marginBottom: 6 }}>TOU Tariff</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
              <div><span style={{ color: "#666" }}>On-peak rate</span><input type="number" step="0.01" value={settings.tariff.onpeak_rate} onChange={(e) => updateSetting("tariff.onpeak_rate", parseFloat(e.target.value) || 0)} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Off-peak rate</span><input type="number" step="0.01" value={settings.tariff.offpeak_rate} onChange={(e) => updateSetting("tariff.offpeak_rate", parseFloat(e.target.value) || 0)} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Demand charge</span><input type="number" step="0.01" value={settings.tariff.demand_charge} onChange={(e) => updateSetting("tariff.demand_charge", parseFloat(e.target.value) || 0)} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Peak hours</span>
                <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                  <input type="number" min="0" max="23" value={settings.tariff.onpeak_start} onChange={(e) => updateSetting("tariff.onpeak_start", parseInt(e.target.value))} style={{ ...inp, width: "50%" }} />
                  <input type="number" min="1" max="24" value={settings.tariff.onpeak_end} onChange={(e) => updateSetting("tariff.onpeak_end", parseInt(e.target.value))} style={{ ...inp, width: "50%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Operating schedule */}
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 8 }}>
            <div style={{ ...label, marginBottom: 6 }}>Operating Schedule</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
              <div><span style={{ color: "#666" }}>Start hour</span><input type="number" min="0" max="23" value={settings.schedule.operating_start} onChange={(e) => updateSetting("schedule.operating_start", parseInt(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>End hour</span><input type="number" min="1" max="24" value={settings.schedule.operating_end} onChange={(e) => updateSetting("schedule.operating_end", parseInt(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
            </div>
          </div>

          {/* Alerts */}
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 8 }}>
            <div style={{ ...label, marginBottom: 6 }}>Alerts</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
              <div><span style={{ color: "#666" }}>Energy over %</span><input type="number" value={settings.alerts.energy_alert_pct} onChange={(e) => updateSetting("alerts.energy_alert_pct", parseInt(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Peak alert %</span><input type="number" value={settings.alerts.peak_alert_pct} onChange={(e) => updateSetting("alerts.peak_alert_pct", parseInt(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Demand budget kW</span><input type="number" step="0.1" value={settings.alerts.demand_budget_kw} onChange={(e) => updateSetting("alerts.demand_budget_kw", parseFloat(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
              <div><span style={{ color: "#666" }}>Target reduction %</span><input type="number" value={settings.gamification.target_reduction} onChange={(e) => updateSetting("gamification.target_reduction", parseInt(e.target.value))} style={{ ...inp, marginTop: 2 }} /></div>
            </div>
          </div>

          {/* Model config (AC model params JSON) */}
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 8 }}>
            <div style={{ ...label, marginBottom: 6 }}>Model Parameters</div>
            <textarea value={JSON.stringify(settings.model_config, null, 2)}
              onChange={(e) => { try { updateSetting("model_config", JSON.parse(e.target.value)); } catch {} }}
              style={{ ...inp, minHeight: 60, fontFamily: "monospace", fontSize: 10, resize: "vertical" }}
              placeholder="Paste ac_model_config.json or train to auto-fill" />
            <div style={{ fontSize: 9, color: "#94a3b8" }}>{Object.keys(settings.model_config).length} params</div>
          </div>

          {/* Output table */}
          <div>
            <div style={label}>Output Table</div>
            <input value={settings.output_table} onChange={(e) => updateSetting("output_table", e.target.value)} style={inp} placeholder="energy_predictions" />
            <div style={{ fontSize: 9, color: "#94a3b8" }}>Results persist here for other widgets</div>
          </div>

          <button onClick={() => {
            // Persist settings to widget config
            if (onSaveConfig) onSaveConfig(settings);
            runMonitor();
          }} style={{ padding: "8px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
            Save & Apply
          </button>
        </div>
      )}

      {error && tab !== "monitor" && <div style={{ color: "#ef4444", fontSize: 11, padding: 4 }}>{error}</div>}
    </div>
  );
}
