/**
 * Energy Intelligence Engine
 *
 * Full pipeline: power data → daily stats → bins → calibration →
 *   gamification → alerts → demand tracking
 *
 * This runs server-side in the compute API.
 */

import { predictEnergy } from "./energy-formulas.js";

// ─── Main: energy_monitor ────────────────────────────────────────────────────
export function energyMonitor(rows, modelConfig, inputs) {
  const {
    rate = 4.0, setpoint = 24, percentile = 50,
    operating_start = 8, operating_end = 22,
    operating_days = [1, 2, 3, 4, 5], // 1=Mon..7=Sun
    demand_budget_kw = 5.0,
    energy_alert_pct = 5, peak_alert_pct = 80,
    target_reduction = 10,
  } = inputs;

  if (!rows || rows.length === 0) {
    return { error: "No power data", daily_stats: [], summary: {} };
  }

  // ─── Parse and group by day ────────────────────────────────────────────
  const dayMap = {};
  for (const row of rows) {
    const ts = new Date(row.timestamp);
    const dayKey = ts.toISOString().slice(0, 10);
    if (!dayMap[dayKey]) dayMap[dayKey] = { readings: [], date: dayKey, ts };
    dayMap[dayKey].readings.push({
      power: parseFloat(row.power_w) || 0,
      temp_int: parseFloat(row.temp_int) || 24,
      temp_ext: parseFloat(row.temp_ext) || 30,
      state: row.state || "UNKNOWN",
      hour: ts.getHours() + ts.getMinutes() / 60,
      dow: ts.getDay() === 0 ? 7 : ts.getDay(), // 1=Mon..7=Sun
      ts,
    });
  }

  // ─── Power bins ────────────────────────────────────────────────────────
  const activePowers = rows.map((r) => parseFloat(r.power_w) || 0).filter((p) => p > 20);
  activePowers.sort((a, b) => a - b);
  const p33 = activePowers[Math.floor(activePowers.length * 0.33)] || 200;
  const p66 = activePowers[Math.floor(activePowers.length * 0.66)] || 600;

  const powerBins = [
    { label: "Low", range: `<${Math.round(p33)}W`, min: 0, max: p33, count: 0, wh: 0 },
    { label: "Medium", range: `${Math.round(p33)}-${Math.round(p66)}W`, min: p33, max: p66, count: 0, wh: 0 },
    { label: "High", range: `>${Math.round(p66)}W`, min: p66, max: Infinity, count: 0, wh: 0 },
  ];

  for (const row of rows) {
    const p = parseFloat(row.power_w) || 0;
    if (p < 20) continue;
    const bin = p < p33 ? powerBins[0] : p < p66 ? powerBins[1] : powerBins[2];
    bin.count++;
    bin.wh += p * 0.25;
  }
  for (const b of powerBins) {
    b.kwh = round2(b.wh / 1000);
    b.avg_w = b.count > 0 ? Math.round(b.wh / (b.count * 0.25)) : 0;
  }

  // ─── Time bins ─────────────────────────────────────────────────────────
  const timeBins = {
    operating: { label: "Operating", count: 0, wh: 0 },
    off_hours: { label: "Off-Hours", count: 0, wh: 0 },
  };
  for (const row of rows) {
    const ts = new Date(row.timestamp);
    const h = ts.getHours();
    const dow = ts.getDay() === 0 ? 7 : ts.getDay();
    const isOp = h >= operating_start && h < operating_end && operating_days.includes(dow);
    const bin = isOp ? timeBins.operating : timeBins.off_hours;
    bin.count++;
    bin.wh += (parseFloat(row.power_w) || 0) * 0.25;
  }
  for (const b of Object.values(timeBins)) {
    b.kwh = round2(b.wh / 1000);
    b.avg_w = b.count > 0 ? Math.round(b.wh / (b.count * 0.25)) : 0;
  }

  // ─── Daily stats with predictions ──────────────────────────────────────
  const dailyStats = [];
  let totalActual = 0, totalPredicted = 0;
  let monthlyPeak = 0;
  let streak = 0, maxStreak = 0;

  const sortedDays = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));

  for (const [date, day] of sortedDays) {
    const readings = day.readings;
    if (readings.length < 4) continue;

    const actual_wh = readings.reduce((s, r) => s + r.power * 0.25, 0);
    const actual_kwh = actual_wh / 1000;
    const peak_kw = Math.max(...readings.map((r) => r.power)) / 1000;
    if (peak_kw > monthlyPeak) monthlyPeak = peak_kw;

    const onReadings = readings.filter((r) => r.power > 50);
    const avg_Te = onReadings.length > 0
      ? onReadings.reduce((s, r) => s + r.temp_ext, 0) / onReadings.length
      : readings.reduce((s, r) => s + r.temp_ext, 0) / readings.length;
    const Ti_start = readings[0].temp_int;
    const op_hours = onReadings.length * 0.25;

    // Model prediction
    const pred = predictEnergy(modelConfig, {
      Ti: Ti_start, Te: avg_Te, setpoint,
      hours: Math.max(op_hours - 2, 0),
    });
    const predicted_kwh = pred.e_total_kWh;

    // Percentile calibration: adjust prediction by target percentile
    // Lower percentile = more aggressive target (use lower bound)
    const pctFactor = 1 + (percentile - 50) / 100; // p50=1.0, p25=0.75, p75=1.25
    const calibrated_kwh = predicted_kwh * pctFactor;

    const savings_kwh = calibrated_kwh - actual_kwh;
    const savings_pct = calibrated_kwh > 0 ? (savings_kwh / calibrated_kwh) * 100 : 0;
    const isUnder = savings_kwh >= 0;

    // Time bin for the day
    const opCount = readings.filter((r) =>
      r.hour >= operating_start && r.hour < operating_end && operating_days.includes(r.dow)
    ).length;
    const timeBin = opCount > readings.length / 2 ? "operating" : "off_hours";

    // Power bin for the day
    const avgPower = actual_wh / (readings.length * 0.25);
    const powerBin = avgPower < p33 ? "Low" : avgPower < p66 ? "Medium" : "High";

    // ─── Badges ──────────────────────────────────────────────────────────
    const badges = [];

    // perfectDay: all operating-hour readings under prediction baseline
    const opReadings = readings.filter((r) =>
      r.hour >= operating_start && r.hour < operating_end
    );
    if (opReadings.length > 0 && isUnder) badges.push("perfectDay");

    // Streak
    if (isUnder) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
      if (streak >= 3) badges.push("streak3");
      if (streak >= 7) badges.push("streak7");
    } else {
      streak = 0;
    }

    // Period winners (best time period)
    const periods = { morning: [], afternoon: [], evening: [] };
    for (const r of readings) {
      if (r.hour >= 6 && r.hour < 12) periods.morning.push(r.power);
      else if (r.hour >= 12 && r.hour < 18) periods.afternoon.push(r.power);
      else if (r.hour >= 18 && r.hour < 24) periods.evening.push(r.power);
    }
    const bestPeriod = Object.entries(periods)
      .filter(([, v]) => v.length > 0)
      .sort(([, a], [, b]) => avg(a) - avg(b))[0];
    if (bestPeriod && isUnder) badges.push(`${bestPeriod[0]}Winner`);

    // Demand defender
    if (peak_kw < demand_budget_kw) badges.push("demandDefender");

    const stat = {
      date, actual_kwh: round2(actual_kwh), predicted_kwh: round2(calibrated_kwh),
      raw_predicted_kwh: round2(predicted_kwh),
      savings_kwh: round2(savings_kwh), savings_pct: round1(savings_pct),
      peak_kw: round2(peak_kw), operating_hours: round1(op_hours),
      avg_te: round1(avg_Te), ti_start: round1(Ti_start),
      time_bin: timeBin, power_bin: powerBin,
      badges, status: isUnder ? "under" : "over",
    };

    dailyStats.push(stat);
    totalActual += actual_kwh;
    totalPredicted += calibrated_kwh;
  }

  const totalSavings = totalPredicted - totalActual;
  const daysUnder = dailyStats.filter((d) => d.status === "under").length;
  const totalDays = dailyStats.length;

  // ─── Alerts ────────────────────────────────────────────────────────────
  const alerts = [];
  const lastDay = dailyStats[dailyStats.length - 1];

  if (lastDay) {
    // Energy over threshold
    if (lastDay.savings_pct < -energy_alert_pct) {
      alerts.push({
        type: "energy_over", severity: "warning",
        message: `Yesterday ${lastDay.date}: ${Math.abs(lastDay.savings_pct)}% over prediction`,
        value: lastDay.actual_kwh, threshold: lastDay.predicted_kwh,
      });
    }

    // Peak approaching
    if (monthlyPeak > demand_budget_kw * (peak_alert_pct / 100)) {
      alerts.push({
        type: "peak_approaching", severity: monthlyPeak > demand_budget_kw ? "critical" : "warning",
        message: `Peak demand ${round2(monthlyPeak)} kW (budget: ${demand_budget_kw} kW)`,
        value: monthlyPeak, threshold: demand_budget_kw,
      });
    }

    // Consecutive over days
    if (streak === 0) {
      const overStreak = dailyStats.slice().reverse().findIndex((d) => d.status === "under");
      if (overStreak >= 3) {
        alerts.push({
          type: "consecutive_over", severity: "warning",
          message: `${overStreak} consecutive days over prediction`,
          value: overStreak, threshold: 3,
        });
      }
    }
  }

  // ─── Gamification summary ──────────────────────────────────────────────
  const allBadges = dailyStats.flatMap((d) => d.badges);
  const badgeCounts = {};
  for (const b of allBadges) badgeCounts[b] = (badgeCounts[b] || 0) + 1;

  // Calendar data (for heatmap)
  const calendar = dailyStats.map((d) => ({
    date: d.date,
    value: d.savings_pct,
    status: d.status,
    badges: d.badges.length,
  }));

  // Leaderboard (top 5 days by savings)
  const leaderboard = dailyStats
    .filter((d) => d.status === "under")
    .sort((a, b) => b.savings_pct - a.savings_pct)
    .slice(0, 5)
    .map((d) => ({ date: d.date, savings_pct: d.savings_pct, savings_kwh: d.savings_kwh }));

  // ─── Chart series ──────────────────────────────────────────────────────
  const chart = {
    labels: dailyStats.map((d) => d.date.slice(5)),
    series: [
      { label: "Actual (kWh)", values: dailyStats.map((d) => d.actual_kwh), color: "#3b82f6" },
      { label: "Predicted (kWh)", values: dailyStats.map((d) => d.predicted_kwh), color: "#94a3b8" },
    ],
  };

  // ─── Summary ───────────────────────────────────────────────────────────
  return {
    summary: {
      total_days: totalDays,
      days_under: daysUnder,
      days_over: totalDays - daysUnder,
      success_rate: totalDays > 0 ? Math.round((daysUnder / totalDays) * 100) : 0,
      actual_total_kWh: round2(totalActual),
      predicted_total_kWh: round2(totalPredicted),
      savings_total_kWh: round2(totalSavings),
      actual_cost_thb: round2(totalActual * rate),
      predicted_cost_thb: round2(totalPredicted * rate),
      savings_cost_thb: round2(totalSavings * rate),
      overall_status: totalSavings >= 0 ? "UNDER BUDGET" : "OVER BUDGET",
      current_streak: streak,
      max_streak: maxStreak,
      monthly_peak_kw: round2(monthlyPeak),
      demand_budget_kw,
      percentile,
    },
    daily_stats: dailyStats,
    power_bins: powerBins,
    time_bins: timeBins,
    gamification: {
      badge_counts: badgeCounts,
      total_badges: allBadges.length,
      calendar,
      leaderboard,
      current_streak: streak,
      max_streak: maxStreak,
    },
    alerts,
    chart,
    demand: {
      peak_kw: round2(monthlyPeak),
      budget_kw: demand_budget_kw,
      usage_pct: round1((monthlyPeak / demand_budget_kw) * 100),
      status: monthlyPeak <= demand_budget_kw ? "OK" : "OVER",
    },
  };
}

function avg(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
