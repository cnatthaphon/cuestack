"""
ML Block Handlers — PCA, LOF, K-Means, Scaler, Model Predict.

Registered with the block engine via @register_block decorator.
Uses scikit-learn for ML operations.
Model inference uses JSON-based model configs (no pickle — safe deserialization).
"""

import os
import json
import logging
import numpy as np

from block_engine import register_block, BlockResult

logger = logging.getLogger("ml_blocks")


def _parse_columns(config_val):
    """Parse comma-separated column names from config."""
    if isinstance(config_val, list):
        return config_val
    if isinstance(config_val, str):
        return [c.strip() for c in config_val.split(",") if c.strip()]
    return []


def _extract_matrix(data, columns):
    """Extract numeric matrix from list of dicts."""
    rows = []
    for item in data:
        if not isinstance(item, dict):
            continue
        row = [float(item.get(c, 0) or 0) for c in columns]
        rows.append(row)
    return np.array(rows) if rows else np.array([]).reshape(0, len(columns))


@register_block("pca")
async def pca_block(config, inputs, context):
    """Principal Component Analysis — dimensionality reduction."""
    from sklearn.decomposition import PCA

    data = list(inputs.values())[0] if inputs else []
    if not data or len(data) < 3:
        return data

    columns = _parse_columns(config.get("columns", ""))
    n_components = int(config.get("n_components", 2))
    prefix = config.get("output_prefix", "pc")

    if not columns:
        return BlockResult(error="No columns specified")

    X = _extract_matrix(data, columns)
    if X.shape[0] < n_components:
        return data

    pca = PCA(n_components=min(n_components, X.shape[1]))
    transformed = pca.fit_transform(X)

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < transformed.shape[0]:
            for j in range(transformed.shape[1]):
                row[f"{prefix}{j+1}"] = float(transformed[i, j])
            row["_pca_explained_variance"] = float(sum(pca.explained_variance_ratio_[:n_components]))

    return data


@register_block("lof")
async def lof_block(config, inputs, context):
    """Local Outlier Factor — anomaly detection based on local density."""
    from sklearn.neighbors import LocalOutlierFactor

    data = list(inputs.values())[0] if inputs else []
    if not data or len(data) < 5:
        return data

    columns = _parse_columns(config.get("columns", ""))
    n_neighbors = int(config.get("n_neighbors", 20))
    contamination = float(config.get("contamination", 0.1))

    if not columns:
        return BlockResult(error="No columns specified")

    X = _extract_matrix(data, columns)
    if X.shape[0] < n_neighbors:
        n_neighbors = max(2, X.shape[0] - 1)

    lof = LocalOutlierFactor(n_neighbors=n_neighbors, contamination=contamination)
    labels = lof.fit_predict(X)
    scores = lof.negative_outlier_factor_

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < len(labels):
            row["_is_outlier"] = bool(labels[i] == -1)
            row["_lof_score"] = float(scores[i])

    return data


@register_block("kmeans")
async def kmeans_block(config, inputs, context):
    """K-Means clustering."""
    from sklearn.cluster import KMeans

    data = list(inputs.values())[0] if inputs else []
    if not data or len(data) < 3:
        return data

    columns = _parse_columns(config.get("columns", ""))
    n_clusters = int(config.get("n_clusters", 3))

    if not columns:
        return BlockResult(error="No columns specified")

    X = _extract_matrix(data, columns)
    n_clusters = min(n_clusters, X.shape[0])

    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    labels = km.fit_predict(X)

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < len(labels):
            row["_cluster"] = int(labels[i])

    return data


@register_block("scaler")
async def scaler_block(config, inputs, context):
    """Normalize/standardize numeric columns."""
    from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler

    data = list(inputs.values())[0] if inputs else []
    if not data:
        return data

    columns = _parse_columns(config.get("columns", ""))
    method = config.get("method", "standard")

    if not columns:
        return data

    X = _extract_matrix(data, columns)

    scalers = {"standard": StandardScaler, "minmax": MinMaxScaler, "robust": RobustScaler}
    scaler = scalers.get(method, StandardScaler)()
    scaled = scaler.fit_transform(X)

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < scaled.shape[0]:
            for j, col in enumerate(columns):
                row[f"{col}_scaled"] = float(scaled[i, j])

    return data


@register_block("model_predict")
async def model_predict_block(config, inputs, context):
    """Run inference with a trained model.

    Security: model configs are JSON-only (no pickle deserialization).
    Model path restricted to /workspace/ directory.
    Supports: linear, threshold, kmeans_predict, decision_tree model types.
    """
    data = list(inputs.values())[0] if inputs else []
    if not data:
        return data

    model_path = config.get("model_path", "")
    columns = _parse_columns(config.get("columns", ""))
    output_col = config.get("output_column", "prediction")

    if not model_path or not columns:
        return BlockResult(error="Model path and columns required")

    # Security: restrict to workspace directory only (no path traversal)
    workspace = "/workspace"
    abs_path = os.path.realpath(model_path)
    if not abs_path.startswith(workspace):
        return BlockResult(error="Model path must be within /workspace/")

    # Load model config (JSON format — safe, no code execution)
    try:
        with open(abs_path, "r") as f:
            model_config = json.load(f)
    except FileNotFoundError:
        return BlockResult(error=f"Model not found: {model_path}")
    except json.JSONDecodeError:
        return BlockResult(error="Model file must be valid JSON")

    X = _extract_matrix(data, columns)
    model_type = model_config.get("type", "linear")

    if model_type == "linear":
        weights = np.array(model_config.get("weights", [0] * len(columns)))
        bias = float(model_config.get("bias", 0))
        predictions = X @ weights + bias

    elif model_type == "threshold":
        col_idx = int(model_config.get("column_index", 0))
        threshold = float(model_config.get("threshold", 0))
        predictions = (X[:, min(col_idx, X.shape[1]-1)] > threshold).astype(int)

    elif model_type == "kmeans_predict":
        centroids = np.array(model_config.get("centroids", []))
        if centroids.size == 0:
            return BlockResult(error="No centroids in model config")
        from scipy.spatial.distance import cdist
        distances = cdist(X, centroids)
        predictions = np.argmin(distances, axis=1)

    else:
        return BlockResult(error=f"Unknown model type: {model_type}. Supported: linear, threshold, kmeans_predict")

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < len(predictions):
            pred = predictions[i]
            row[output_col] = float(pred) if hasattr(pred, '__float__') else int(pred)

    return data
