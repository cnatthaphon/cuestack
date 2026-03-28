"""
ML/Analytics blocks for the visual flow engine.

Each function takes data (list of dicts) + config → returns processed data.
Designed to be used from both the scheduler and the frontend flow API.

Custom code block uses subprocess isolation for security.
"""

import math
import json
import subprocess
import tempfile
import os
import logging

logger = logging.getLogger("ml_blocks")


def anomaly_detection(data: list, config: dict) -> tuple[list, str]:
    """Z-score anomaly detection. Flags rows where value deviates > threshold std devs."""
    col = config.get("column")
    threshold = float(config.get("threshold", 2.0))
    if not col or not data:
        return data, "No column or data"

    values = [float(r.get(col, 0) or 0) for r in data]
    n = len(values)
    if n < 3:
        return data, f"Need at least 3 rows (got {n})"

    mean = sum(values) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in values) / n) if n > 0 else 0
    if std == 0:
        for r in data:
            r["_anomaly"] = False
            r["_z_score"] = 0
        return data, f"No variance in {col}"

    anomalies = 0
    for r, v in zip(data, values):
        z = (v - mean) / std
        r["_z_score"] = round(z, 3)
        r["_anomaly"] = abs(z) > threshold
        if r["_anomaly"]:
            anomalies += 1

    return data, f"Anomalies: {anomalies}/{n} (threshold={threshold}, mean={round(mean,2)}, std={round(std,2)})"


def statistics(data: list, config: dict) -> tuple[list, str]:
    """Compute descriptive statistics on a column."""
    col = config.get("column")
    if not col or not data:
        return [{}], "No column or data"

    values = sorted([float(r.get(col, 0) or 0) for r in data])
    n = len(values)
    if n == 0:
        return [{}], "No data"

    mean = sum(values) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in values) / n)
    q1 = values[n // 4] if n >= 4 else values[0]
    median = values[n // 2]
    q3 = values[3 * n // 4] if n >= 4 else values[-1]

    result = [{
        "column": col, "count": n,
        "mean": round(mean, 3), "std": round(std, 3),
        "min": round(values[0], 3), "q1": round(q1, 3),
        "median": round(median, 3), "q3": round(q3, 3),
        "max": round(values[-1], 3), "iqr": round(q3 - q1, 3),
    }]
    return result, f"Stats({col}): mean={round(mean,2)}, std={round(std,2)}, n={n}"


def moving_average(data: list, config: dict) -> tuple[list, str]:
    """Compute moving average on a column."""
    col = config.get("column")
    window = int(config.get("window", 5))
    if not col or not data:
        return data, "No column or data"

    values = [float(r.get(col, 0) or 0) for r in data]
    out_col = f"{col}_ma{window}"

    for i, r in enumerate(data):
        start = max(0, i - window + 1)
        window_vals = values[start:i + 1]
        r[out_col] = round(sum(window_vals) / len(window_vals), 3)

    return data, f"Moving avg({col}, window={window}) -> {out_col}"


def fft_analysis(data: list, config: dict) -> tuple[list, str]:
    """FFT frequency analysis on a column."""
    col = config.get("column")
    if not col or not data:
        return data, "No column or data"

    values = [float(r.get(col, 0) or 0) for r in data]
    n = len(values)
    if n < 8:
        return data, f"Need at least 8 samples for FFT (got {n})"

    try:
        import numpy as np
        from scipy.fft import fft, fftfreq

        signal = np.array(values) - np.mean(values)
        yf = fft(signal)
        xf = fftfreq(n, d=1.0)
        magnitudes = 2.0 / n * np.abs(yf[:n // 2])
        freqs = xf[:n // 2]

        top_indices = np.argsort(magnitudes)[::-1][:5]
        result = []
        for idx in top_indices:
            if magnitudes[idx] > 0.01:
                result.append({
                    "frequency": round(float(freqs[idx]), 4),
                    "magnitude": round(float(magnitudes[idx]), 3),
                    "period": round(1.0 / freqs[idx], 2) if freqs[idx] > 0 else 0,
                })
        return result, f"FFT({col}): {len(result)} dominant frequencies"
    except ImportError:
        return data, "numpy/scipy not available for FFT"


def run_custom_code(data: list, config: dict) -> tuple[list, str]:
    """Execute user code in an isolated subprocess.

    The code runs in a separate Python process with:
    - stdin: JSON input data
    - stdout: JSON output data
    - 10 second timeout
    - No network access (inherits container restrictions)
    """
    code = config.get("code", "")
    if not code:
        return data, "No code provided"

    # Write code to temp file with wrapper
    wrapper = f"""
import json, sys, math

data = json.loads(sys.stdin.read())
result = data  # default: pass through

# --- User code starts ---
{code}
# --- User code ends ---

if not isinstance(result, list):
    result = [{{"value": result}}]
json.dump(result, sys.stdout)
"""

    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(wrapper)
            tmp_path = f.name

        proc = subprocess.run(
            ["python3", tmp_path],
            input=json.dumps(data),
            capture_output=True,
            text=True,
            timeout=10,
        )

        os.unlink(tmp_path)

        if proc.returncode != 0:
            error = proc.stderr.strip()[-200:] if proc.stderr else "Unknown error"
            return data, f"Code error: {error}"

        result = json.loads(proc.stdout)
        return result, f"Custom code: {len(result)} rows output"

    except subprocess.TimeoutExpired:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return data, "Code timeout (10s limit)"
    except json.JSONDecodeError:
        return data, "Code must output valid JSON via result variable"
    except Exception as e:
        return data, f"Execution error: {str(e)[:200]}"
