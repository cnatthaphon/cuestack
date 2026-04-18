/**
 * Energy Intelligence — AC Model Formulas
 *
 * Ported from the AC energy model (create_notebook_v2.py).
 * Pure math — takes model params (from ac_model_config.json) + inputs → outputs.
 *
 * Model params key:
 *   WhC_z1, WhC_z1_std  — Zone 1: Wh per °C of cooling (pulldown energy rate)
 *   Teq_z1              — Zone 1: equilibrium temperature (°C)
 *   minC_z1, minC_z1_std — Zone 1: minutes per °C (pulldown time rate)
 *   E_z2, E_z2_std      — Zone 2: fixed transition energy (Wh)
 *   D_z2                — Zone 2: fixed transition duration (min)
 *   E_z3, E_z3_std      — Zone 3: fixed settling energy (Wh)
 *   D_z3, D_z3_std      — Zone 3: fixed settling duration (min)
 *   k_leak              — Cycling: power coefficient per °C (W/°C)
 *   k_base              — Cycling: base power (W)
 *   w_warmup            — Warmup: fast component weight (0-1)
 *   k_fast              — Warmup: fast decay rate (1/hr)
 *   k_slow              — Warmup: slow decay rate (1/hr)
 *   Te_ref              — Reference outdoor temperature (°C)
 *   te_coeff            — Outdoor temp energy correction (Wh/°C)
 *   te_time_coeff       — Outdoor temp time correction (min/°C)
 */

// ─── Predict total energy (Wh and kWh) with error bounds ──────────────────────
export function predictEnergy(params, { Ti, Te, setpoint = 24, hours = 8, Te_end = null }) {
  const { WhC_z1: wpc, WhC_z1_std: wpc_std, Teq_z1: teq,
    E_z2: e_z2, E_z2_std: e_z2_std, E_z3: e_z3, E_z3_std: e_z3_std,
    k_leak: kl, k_base: kb, Te_ref: te_r, te_coeff: te_c } = params;

  const dTi = Math.max(Ti - teq, 0);
  const e_z1 = wpc * dTi;
  const e_z1_lo = (wpc - wpc_std) * dTi;
  const e_z1_hi = (wpc + wpc_std) * dTi;
  const e_te = te_c * (Te - te_r);

  const e_pd = e_z1 + e_z2 + e_z3 + e_te;
  const e_pd_lo = e_z1_lo + Math.max(e_z2 - e_z2_std, 0) + Math.max(e_z3 - e_z3_std, 0) + e_te;
  const e_pd_hi = e_z1_hi + e_z2 + e_z2_std + e_z3 + e_z3_std + e_te;

  const Te_cyc = Te_end !== null ? (Te + Te_end) / 2 : Te;
  const p_cyc = Math.max(kl * Math.max(Te_cyc - setpoint, 0) + kb, 0);
  const e_cyc = p_cyc * hours;
  const e_total = e_pd + e_cyc;

  return {
    e_z1, e_z2, e_z3, e_te,
    e_pulldown: e_pd, e_pulldown_lower: e_pd_lo, e_pulldown_upper: e_pd_hi,
    p_cycle: p_cyc, e_cycle: e_cyc, Te_cycling: Te_cyc,
    e_total, e_total_kWh: e_total / 1000,
    e_total_lower: (e_pd_lo + e_cyc) / 1000,
    e_total_upper: (e_pd_hi + e_cyc) / 1000,
  };
}

// ─── Predict pulldown time (minutes) with error bounds ────────────────────────
export function predictTime(params, { Ti, Te }) {
  const { minC_z1: mpc, minC_z1_std: mpc_std, Teq_z1: teq,
    D_z2: d_z2, D_z3: d_z3, D_z3_std: d_z3_std,
    Te_ref: te_r, te_time_coeff: te_tc } = params;

  const dTi = Math.max(Ti - teq, 0);
  const t_z1 = mpc * dTi;
  const t_z1_lo = (mpc - mpc_std) * dTi;
  const t_z1_hi = (mpc + mpc_std) * dTi;
  const t_te = te_tc * (Te - te_r);

  const t = t_z1 + t_te + d_z2 + d_z3;
  const t_lo = t_z1_lo + t_te + d_z2 + Math.max(d_z3 - d_z3_std, 0);
  const t_hi = t_z1_hi + t_te + d_z2 + d_z3 + d_z3_std;

  return {
    t_z1, t_z2: d_z2, t_z3: d_z3, t_te,
    t_total_min: t, t_total_hr: t / 60,
    t_lower_min: t_lo, t_upper_min: t_hi,
  };
}

// ─── Predict room warmup after AC off (°C) ───────────────────────────────────
export function predictWarmup(params, { Ti_off, Te, hours_off }) {
  const { w_warmup: w, k_fast: kf, k_slow: ks } = params;
  return Te - (Te - Ti_off) * (w * Math.exp(-kf * hours_off) + (1 - w) * Math.exp(-ks * hours_off));
}

// ─── Recommend: keep AC on vs turn off and restart ────────────────────────────
export function recommend(params, { Ti, Te, hours_away, setpoint = 24 }) {
  const { k_leak: kl, k_base: kb } = params;

  const p_keep = Math.max(kl * Math.max(Te - setpoint, 0) + kb, 0);
  const e_keep = p_keep * hours_away;

  const Ti_after = predictWarmup(params, { Ti_off: setpoint, Te, hours_off: hours_away });
  const e_restart = predictEnergy(params, { Ti: Ti_after, Te, setpoint, hours: 0 }).e_pulldown;

  return {
    keep_on_Wh: e_keep,
    restart_Wh: e_restart,
    recommendation: e_keep < e_restart ? "KEEP ON" : "TURN OFF",
    savings_Wh: Math.abs(e_keep - e_restart),
    Ti_after_off: Math.round(Ti_after * 10) / 10,
  };
}

// ─── Calculate cost (THB) ─────────────────────────────────────────────────────
export function calculateCost(params, { Ti, Te, setpoint = 24, hours = 8, rate = 4.0, Te_end = null }) {
  const e = predictEnergy(params, { Ti, Te, setpoint, hours, Te_end });
  return {
    ...e,
    cost_thb: Math.round(e.e_total_kWh * rate * 100) / 100,
    cost_lower: Math.round(e.e_total_lower * rate * 100) / 100,
    cost_upper: Math.round(e.e_total_upper * rate * 100) / 100,
  };
}

// ─── Run all formulas for a given set of inputs → full result object ──────────
export function computeAll(params, inputs) {
  const { Ti = 32, Te = 30, setpoint = 24, hours = 8, rate = 4.0, hours_away = 3 } = inputs;

  const energy = predictEnergy(params, { Ti, Te, setpoint, hours });
  const time = predictTime(params, { Ti, Te });
  const warmup_2h = predictWarmup(params, { Ti_off: setpoint, Te, hours_off: 2 });
  const warmup_4h = predictWarmup(params, { Ti_off: setpoint, Te, hours_off: 4 });
  const rec = recommend(params, { Ti, Te, hours_away, setpoint });
  const cost = calculateCost(params, { Ti, Te, setpoint, hours, rate });

  return {
    inputs: { Ti, Te, setpoint, hours, rate, hours_away },
    energy: {
      total_kWh: round2(energy.e_total_kWh),
      total_lower_kWh: round2(energy.e_total_lower),
      total_upper_kWh: round2(energy.e_total_upper),
      pulldown_Wh: Math.round(energy.e_pulldown),
      cycling_Wh: Math.round(energy.e_cycle),
      cycling_power_W: Math.round(energy.p_cycle),
      zone1_Wh: Math.round(energy.e_z1),
      zone2_Wh: Math.round(energy.e_z2),
      zone3_Wh: Math.round(energy.e_z3),
      te_correction_Wh: Math.round(energy.e_te),
    },
    time: {
      pulldown_min: Math.round(time.t_total_min),
      pulldown_lower_min: Math.round(time.t_lower_min),
      pulldown_upper_min: Math.round(time.t_upper_min),
      pulldown_hr: round2(time.t_total_hr),
      zone1_min: Math.round(time.t_z1),
      zone2_min: Math.round(time.t_z2),
      zone3_min: Math.round(time.t_z3),
    },
    warmup: {
      temp_after_2h: round1(warmup_2h),
      temp_after_4h: round1(warmup_4h),
    },
    recommendation: rec,
    cost: {
      total_thb: cost.cost_thb,
      lower_thb: cost.cost_lower,
      upper_thb: cost.cost_upper,
      rate_thb_per_kWh: rate,
    },
  };
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
