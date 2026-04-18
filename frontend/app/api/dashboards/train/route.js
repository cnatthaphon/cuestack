import { NextResponse } from "next/server";
import { getCurrentUser, createToken } from "../../../../lib/auth.js";
import { query } from "../../../../lib/db.js";
import { queryData, createOrgTable, listOrgTables } from "../../../../lib/org-tables.js";

/**
 * POST /api/dashboards/train
 *
 * Training wizard: generates Python code → executes in Jupyter container →
 * results saved to ei_models table. End user never writes code.
 *
 * Body: {
 *   source_table: "power_consumption",
 *   target_column: "power_w",
 *   feature_columns: ["hour", "dow", "temp_ext", "temp_int"],
 *   model_types: ["linear_regression", "random_forest", "xgboost", "ensemble"],
 *   training_interval: "hourly",    // "15min" | "hourly" | "daily"
 *   test_split: 0.2
 * }
 *
 * Returns: { models: [{ name, type, accuracy: { mae, rmse, r2 }, is_best }], status }
 */
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const {
    source_table = "power_consumption",
    target_column = "power_w",
    feature_columns = ["hour", "dow", "temp_ext", "temp_int"],
    model_types = ["linear_regression", "random_forest", "xgboost", "ensemble"],
    training_interval = "hourly",
    test_split = 0.2,
  } = await request.json();

  // Validate
  if (!source_table) return NextResponse.json({ error: "source_table required" }, { status: 400 });

  // Ensure EI tables exist (auto-create if needed)
  try {
    const existing = await listOrgTables(user.org_id);
    const tableNames = existing.map((t) => t.name);
    if (!tableNames.includes("ei_models")) {
      await createOrgTable(user.org_id, { name: "ei_models", columns: [
        { name: "model_id", type: "text" }, { name: "name", type: "text" }, { name: "model_type", type: "text" },
        { name: "params", type: "json" }, { name: "accuracy", type: "json" }, { name: "is_active", type: "boolean" },
        { name: "trained_at", type: "timestamp" }, { name: "training_days", type: "integer" },
      ], description: "ML models for energy prediction" });
    }
    if (!tableNames.includes("ei_daily_stats")) {
      await createOrgTable(user.org_id, { name: "ei_daily_stats", columns: [
        { name: "date", type: "text" }, { name: "model_id", type: "text" },
        { name: "actual_kwh", type: "float" }, { name: "predicted_kwh", type: "float" },
        { name: "savings_kwh", type: "float" }, { name: "savings_pct", type: "float" },
        { name: "peak_kw", type: "float" }, { name: "operating_hours", type: "float" },
        { name: "avg_te", type: "float" }, { name: "time_bin", type: "text" },
        { name: "power_bin", type: "text" }, { name: "badges", type: "json" }, { name: "status", type: "text" },
      ], description: "Daily energy stats — actual vs predicted" });
    }
  } catch (e) { /* tables may already exist */ }

  // Generate a fresh token for SDK auth in Jupyter container
  const token = await createToken(user);

  // Generate Python training code with embedded token
  const code = generateTrainingCode({
    source_table, target_column, feature_columns,
    model_types, training_interval, test_split, token,
  });

  // Execute in Jupyter container via backend
  const backendUrl = process.env.BACKEND_URL || "http://backend:8000";
  try {
    const res = await fetch(`${backendUrl}/api/run-python`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        org_id: user.org_id,
        page_id: "ei-training",
        timeout: 60,
      }),
    });
    const result = await res.json();

    if (!result.ok) {
      return NextResponse.json({
        error: "Training failed",
        stderr: result.stderr,
        stdout: result.stdout,
      }, { status: 500 });
    }

    // Parse training results from stdout (JSON on last line)
    const lines = (result.stdout || "").trim().split("\n");
    let trainingResult = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        trainingResult = JSON.parse(lines[i]);
        break;
      } catch {}
    }

    if (!trainingResult) {
      return NextResponse.json({
        error: "Could not parse training results",
        stdout: result.stdout,
        stderr: result.stderr,
      }, { status: 500 });
    }

    return NextResponse.json({ data: trainingResult, stdout: result.stdout });
  } catch (e) {
    return NextResponse.json({ error: `Training error: ${e.message}` }, { status: 500 });
  }
}

/**
 * GET /api/dashboards/train — list trained models from ei_models table
 */
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 });

  try {
    const rows = await queryData(user.org_id, "ei_models", {
      limit: 50, order_by: "created_at", order_dir: "DESC",
    });
    return NextResponse.json({ models: rows });
  } catch (e) {
    return NextResponse.json({ models: [], error: e.message });
  }
}

// ─── Generate training Python code ───────────────────────────────────────────
function generateTrainingCode({ source_table, target_column, feature_columns, model_types, training_interval, test_split, token }) {
  const features = JSON.stringify(feature_columns);
  const types = JSON.stringify(model_types);

  return `
import os, json, uuid
from datetime import datetime
os.environ['CUESTACK_TOKEN'] = '${token}'

from cuestack import connect
client = connect()

# ─── Step 1: Load data ───────────────────────────────────────────────────────
print("Loading data from ${source_table}...")
df = client.query('${source_table}', limit=5000)
print(f"Loaded {len(df)} rows")

import pandas as pd
import numpy as np

df['timestamp'] = pd.to_datetime(df['timestamp'])
df['${target_column}'] = pd.to_numeric(df['${target_column}'], errors='coerce')
df['temp_ext'] = pd.to_numeric(df.get('temp_ext', 30), errors='coerce').fillna(30)
df['temp_int'] = pd.to_numeric(df.get('temp_int', 24), errors='coerce').fillna(24)

# ─── Step 2: Feature engineering ──────────────────────────────────────────────
df['hour'] = df['timestamp'].dt.hour
df['dow'] = df['timestamp'].dt.dayofweek
df['is_weekend'] = (df['dow'] >= 5).astype(int)
df['delta_t'] = df['temp_ext'] - df['temp_int']

${training_interval === "hourly" ? `
# Hourly aggregation
hourly = df.groupby(df['timestamp'].dt.floor('h')).agg(
    target=('${target_column}', 'mean'),
    temp_ext=('temp_ext', 'mean'),
    temp_int=('temp_int', 'mean'),
    count=('${target_column}', 'count')
).reset_index()
hourly['hour'] = hourly['timestamp'].dt.hour
hourly['dow'] = hourly['timestamp'].dt.dayofweek
hourly['is_weekend'] = (hourly['dow'] >= 5).astype(int)
hourly['delta_t'] = hourly['temp_ext'] - hourly['temp_int']
data = hourly
` : training_interval === "daily" ? `
# Daily aggregation
daily = df.groupby(df['timestamp'].dt.date).agg(
    target=('${target_column}', 'sum'),
    temp_ext=('temp_ext', 'mean'),
    temp_int=('temp_int', 'mean'),
    count=('${target_column}', 'count')
).reset_index()
daily['timestamp'] = pd.to_datetime(daily['timestamp'])
daily['hour'] = 12
daily['dow'] = daily['timestamp'].dt.dayofweek
daily['is_weekend'] = (daily['dow'] >= 5).astype(int)
daily['delta_t'] = daily['temp_ext'] - daily['temp_int']
data = daily
` : `
# Raw 15-min data
df['target'] = df['${target_column}']
data = df
`}

feature_cols = ${features}
# Add computed features if not in list
for f in ['hour', 'dow', 'is_weekend', 'delta_t']:
    if f not in feature_cols and f in data.columns:
        feature_cols.append(f)

data = data.dropna(subset=['target'] + [c for c in feature_cols if c in data.columns])
print(f"Training data: {len(data)} rows, features: {feature_cols}")

X = data[[c for c in feature_cols if c in data.columns]].values
y = data['target'].values

# ─── Step 3: Train/test split ─────────────────────────────────────────────────
split = int(len(X) * (1 - ${test_split}))
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]
print(f"Train: {len(X_train)}, Test: {len(X_test)}")

# ─── Step 4: Train models ────────────────────────────────────────────────────
from sklearn.metrics import mean_absolute_error, r2_score
try:
    from sklearn.metrics import root_mean_squared_error
except ImportError:
    from sklearn.metrics import mean_squared_error
    def root_mean_squared_error(y_true, y_pred): return mean_squared_error(y_true, y_pred) ** 0.5

model_types = ${types}
trained = {}
results = []

if 'linear_regression' in model_types:
    from sklearn.linear_model import LinearRegression
    m = LinearRegression().fit(X_train, y_train)
    trained['linear_regression'] = m

if 'random_forest' in model_types:
    from sklearn.ensemble import RandomForestRegressor
    m = RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42).fit(X_train, y_train)
    trained['random_forest'] = m

if 'xgboost' in model_types:
    try:
        from sklearn.ensemble import GradientBoostingRegressor
        m = GradientBoostingRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42).fit(X_train, y_train)
        trained['xgboost'] = m
    except Exception as e:
        print(f"XGBoost skipped: {e}")

if 'ensemble' in model_types and len(trained) >= 2:
    from sklearn.ensemble import VotingRegressor
    estimators = [(k, m) for k, m in trained.items()]
    m = VotingRegressor(estimators=estimators).fit(X_train, y_train)
    trained['ensemble'] = m

# ─── Step 5: Evaluate ─────────────────────────────────────────────────────────
for model_type, model in trained.items():
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = root_mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    results.append({
        'model_type': model_type,
        'name': {'linear_regression': 'Linear Regression', 'random_forest': 'Random Forest',
                 'xgboost': 'XGBoost (GBR)', 'ensemble': 'Ensemble (Voting)'}.get(model_type, model_type),
        'mae': round(mae, 4), 'rmse': round(rmse, 4), 'r2': round(r2, 4),
    })
    print(f"  {model_type}: MAE={mae:.4f} RMSE={rmse:.4f} R2={r2:.4f}")

best = max(results, key=lambda x: x['r2']) if results else None

# ─── Step 6: Save to ei_models ────────────────────────────────────────────────
for r in results:
    model_id = str(uuid.uuid4())[:8]
    is_best = best and r['model_type'] == best['model_type']
    row = {
        'model_id': model_id,
        'name': r['name'],
        'model_type': r['model_type'],
        'params': json.dumps({'features': feature_cols, 'train_size': len(X_train), 'test_size': len(X_test), 'interval': '${training_interval}'}),
        'accuracy': json.dumps({'mae': r['mae'], 'rmse': r['rmse'], 'r2': r['r2']}),
        'is_active': is_best,
        'trained_at': datetime.now().isoformat(),
        'training_days': int(len(data['timestamp'].dt.date.unique())) if 'timestamp' in data.columns else 0,
    }
    try:
        client.insert('ei_models', [row])
    except Exception as e:
        print(f"Error saving {r['name']}: {e}")

# ─── Step 7: Generate daily predictions with best model → ei_daily_stats ──────
if best and 'timestamp' in data.columns:
    best_model = trained[best['model_type']]
    daily_groups = data.groupby(data['timestamp'].dt.date)
    daily_preds = []
    for date, group in daily_groups:
        X_day = group[[c for c in feature_cols if c in group.columns]].values
        predicted = float(best_model.predict(X_day).sum())
        actual = float(group['target'].sum())
        savings = predicted - actual
        savings_pct = (savings / predicted * 100) if predicted > 0 else 0
        peak = float(group['target'].max()) / 1000 if '${training_interval}' != 'daily' else float(group['target'].max())
        op_hours = len(group) * (0.25 if '${training_interval}' == '15min' else 1.0 if '${training_interval}' == 'hourly' else 24)
        avg_te = float(group['temp_ext'].mean()) if 'temp_ext' in group.columns else 30.0

        row = {
            'date': str(date),
            'model_id': best['model_type'],
            'actual_kwh': round(actual / 1000, 2) if '${training_interval}' != 'daily' else round(actual, 2),
            'predicted_kwh': round(predicted / 1000, 2) if '${training_interval}' != 'daily' else round(predicted, 2),
            'savings_kwh': round(savings / 1000, 2) if '${training_interval}' != 'daily' else round(savings, 2),
            'savings_pct': round(savings_pct, 1),
            'peak_kw': round(peak, 2),
            'operating_hours': round(op_hours, 1),
            'avg_te': round(avg_te, 1),
            'time_bin': 'operating',
            'power_bin': 'Medium',
            'badges': json.dumps([]),
            'status': 'under' if savings >= 0 else 'over',
        }
        daily_preds.append(row)
        try:
            client.insert('ei_daily_stats', [row])
        except: pass
    print(f"Saved {len(daily_preds)} daily predictions to ei_daily_stats")

# ─── Output JSON result (parsed by API) ──────────────────────────────────────
output = {
    'status': 'success',
    'models': results,
    'best': best,
    'training_rows': len(X_train),
    'test_rows': len(X_test),
    'features': feature_cols,
    'daily_predictions': len(daily_preds) if 'daily_preds' in dir() else 0,
}
print(json.dumps(output))
`;
}
