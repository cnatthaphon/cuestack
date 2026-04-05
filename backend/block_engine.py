"""
Block Execution Engine — runs visual flow pipelines.

Architecture:
  1. Load flow definition (nodes + edges from page config)
  2. Topological sort (respects dependencies)
  3. Execute each block with its config + upstream data
  4. Cache outputs for downstream consumers
  5. Handle async inputs (wait for all upstreams before executing)

Each block implements: execute(config, inputs, context) -> output
"""

import json
import logging
import asyncio
from collections import defaultdict

logger = logging.getLogger("block_engine")


class BlockContext:
    """Execution context passed to every block."""
    def __init__(self, org_id, user_id=None, clickhouse=None, mqtt=None):
        self.org_id = org_id
        self.user_id = user_id
        self.clickhouse = clickhouse
        self.mqtt = mqtt
        self.metadata = {}


class BlockResult:
    """Output from a block execution."""
    def __init__(self, data=None, error=None, metadata=None):
        self.data = data
        self.error = error
        self.metadata = metadata or {}

    @property
    def ok(self):
        return self.error is None


# Block registry — maps type to execute function
_BLOCK_HANDLERS = {}


def register_block(block_type):
    """Decorator to register a block handler."""
    def decorator(fn):
        _BLOCK_HANDLERS[block_type] = fn
        return fn
    return decorator


def topological_sort(nodes, edges):
    """Sort nodes in execution order (upstream before downstream)."""
    in_degree = {n["id"]: 0 for n in nodes}
    adj = defaultdict(list)

    for edge in edges:
        src = edge.get("from") or edge.get("source")
        tgt = edge.get("to") or edge.get("target")
        if src and tgt:
            adj[src].append(tgt)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = [n["id"] for n in nodes if in_degree.get(n["id"], 0) == 0]
    order = []

    while queue:
        node_id = queue.pop(0)
        order.append(node_id)
        for neighbor in adj[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return order


async def execute_flow(nodes, edges, context):
    """Execute a visual flow pipeline.

    Args:
        nodes: list of {id, type, config}
        edges: list of {from, to}
        context: BlockContext

    Returns:
        dict of {node_id: BlockResult}
    """
    node_map = {n["id"]: n for n in nodes}
    execution_order = topological_sort(nodes, edges)

    # Build upstream map: node_id -> list of upstream node_ids
    upstream = defaultdict(list)
    for edge in edges:
        src = edge.get("from") or edge.get("source")
        tgt = edge.get("to") or edge.get("target")
        if src and tgt:
            upstream[tgt].append(src)

    # Execute blocks in order, caching results
    results = {}

    for node_id in execution_order:
        node = node_map.get(node_id)
        if not node:
            continue

        block_type = node.get("type")
        config = node.get("config", {})
        handler = _BLOCK_HANDLERS.get(block_type)

        if not handler:
            results[node_id] = BlockResult(error=f"Unknown block type: {block_type}")
            logger.warning(f"No handler for block type: {block_type}")
            continue

        # Collect upstream outputs
        inputs = {}
        for up_id in upstream.get(node_id, []):
            up_result = results.get(up_id)
            if up_result and up_result.ok:
                inputs[up_id] = up_result.data

        # Execute block
        try:
            result = await handler(config, inputs, context)
            if isinstance(result, BlockResult):
                results[node_id] = result
            else:
                results[node_id] = BlockResult(data=result)
            logger.info(f"Block {node_id} ({block_type}): ok")
        except Exception as e:
            results[node_id] = BlockResult(error=str(e))
            logger.error(f"Block {node_id} ({block_type}): {e}")

    return results


# ---------------------------------------------------------------------------
# Built-in block handlers
# ---------------------------------------------------------------------------

@register_block("mqtt_subscribe")
async def mqtt_subscribe(config, inputs, context):
    """Subscribe to MQTT channels — in service mode, this is event-driven."""
    channels = config.get("channels", "")
    if isinstance(channels, str):
        channels = [c.strip() for c in channels.split(",") if c.strip()]
    return {"channels": channels, "format": config.get("format", "json")}


@register_block("data_source")
async def data_source(config, inputs, context):
    """Load data from ClickHouse table."""
    import clickhouse_client
    table = config.get("table", "")
    limit = config.get("limit", 100)
    if not table:
        return BlockResult(error="No table selected")
    events = await clickhouse_client.query_events(
        org_id=context.org_id, channel=table, limit=limit
    )
    return events


@register_block("filter")
async def filter_block(config, inputs, context):
    """Filter data rows by condition."""
    data = list(inputs.values())[0] if inputs else []
    if not data or not isinstance(data, list):
        return data
    col = config.get("column", "")
    op = config.get("operator", "==")
    val = config.get("value", "")

    filtered = []
    for row in data:
        rv = row.get(col)
        try:
            if op == "==" and str(rv) == str(val): filtered.append(row)
            elif op == "!=" and str(rv) != str(val): filtered.append(row)
            elif op == ">" and float(rv or 0) > float(val): filtered.append(row)
            elif op == "<" and float(rv or 0) < float(val): filtered.append(row)
            elif op == ">=" and float(rv or 0) >= float(val): filtered.append(row)
            elif op == "<=" and float(rv or 0) <= float(val): filtered.append(row)
            elif op == "contains" and str(val) in str(rv or ""): filtered.append(row)
            elif op == "is null" and rv is None: filtered.append(row)
            elif op == "is not null" and rv is not None: filtered.append(row)
        except (ValueError, TypeError):
            pass
    return filtered


@register_block("transform")
async def transform_block(config, inputs, context):
    """Transform column values."""
    data = list(inputs.values())[0] if inputs else []
    if not data or not isinstance(data, list):
        return data
    col = config.get("column", "")
    operation = config.get("operation", "")
    param = config.get("param", "")

    for row in data:
        v = row.get(col)
        if v is None: continue
        if operation == "round": row[col] = round(float(v), int(param or 0))
        elif operation == "abs": row[col] = abs(float(v))
        elif operation == "uppercase": row[col] = str(v).upper()
        elif operation == "lowercase": row[col] = str(v).lower()
        elif operation == "multiply": row[col] = float(v) * float(param or 1)
        elif operation == "add": row[col] = float(v) + float(param or 0)
    return data


@register_block("aggregate")
async def aggregate_block(config, inputs, context):
    """Group and aggregate data."""
    data = list(inputs.values())[0] if inputs else []
    if not data: return []
    group_by = config.get("group_by", "")
    agg_col = config.get("agg_column", "")
    agg_func = config.get("agg_func", "count")

    from collections import defaultdict
    groups = defaultdict(list)
    for row in data:
        key = row.get(group_by, "all")
        groups[key].append(row)

    result = []
    for key, rows in groups.items():
        vals = [float(r.get(agg_col, 0) or 0) for r in rows]
        agg_val = 0
        if agg_func == "count": agg_val = len(rows)
        elif agg_func == "sum": agg_val = sum(vals)
        elif agg_func == "avg": agg_val = sum(vals) / len(vals) if vals else 0
        elif agg_func == "min": agg_val = min(vals) if vals else 0
        elif agg_func == "max": agg_val = max(vals) if vals else 0
        result.append({group_by: key, f"{agg_func}_{agg_col}": round(agg_val, 4)})
    return result


@register_block("insert")
async def insert_block(config, inputs, context):
    """Store data to ClickHouse."""
    import clickhouse_client
    data = list(inputs.values())[0] if inputs else []
    table = config.get("table", "")
    if not table or not data:
        return {"stored": 0}

    count = 0
    for item in (data if isinstance(data, list) else [data]):
        await clickhouse_client.insert_event(
            org_id=context.org_id, channel=table,
            source="pipeline", payload=item if isinstance(item, dict) else {"value": item}
        )
        count += 1
    return {"stored": count, "table": table}


@register_block("ws_publish")
async def ws_publish_block(config, inputs, context):
    """Broadcast data to WebSocket channels."""
    import channels as ch
    data = list(inputs.values())[0] if inputs else {}
    channels = config.get("channels", "")
    if isinstance(channels, str):
        channels = [c.strip() for c in channels.split(",") if c.strip()]

    count = 0
    for channel in channels:
        await ch.publish(context.org_id, channel, data if isinstance(data, dict) else {"data": data})
        count += 1
    return {"broadcast": count, "channels": channels}


@register_block("mqtt_publish")
async def mqtt_publish_block(config, inputs, context):
    """Publish data to MQTT topic."""
    data = list(inputs.values())[0] if inputs else {}
    topic = config.get("topic", "")
    qos = int(config.get("qos", 0))
    if not topic:
        return BlockResult(error="No topic specified")
    if context.mqtt:
        payload = json.dumps(data) if isinstance(data, dict) else str(data)
        await context.mqtt.publish(topic, payload, qos=qos)
    return {"published": True, "topic": topic}


@register_block("chart")
async def chart_block(config, inputs, context):
    """Prepare chart data (rendering happens on frontend)."""
    data = list(inputs.values())[0] if inputs else []
    return {
        "chart_type": config.get("chart_type", "bar"),
        "x_column": config.get("x_column", ""),
        "y_column": config.get("y_column", ""),
        "title": config.get("title", ""),
        "data": data,
    }


@register_block("custom_code")
async def custom_code_block(config, inputs, context):
    """Run custom Python code."""
    code = config.get("code", "")
    params = config.get("params", "{}")
    data = list(inputs.values())[0] if inputs else None

    if not code:
        return data

    try:
        custom_params = json.loads(params) if isinstance(params, str) else params
    except json.JSONDecodeError:
        custom_params = {}

    # Execute in restricted namespace — no file access, no imports, no system calls
    safe_builtins = {
        "len": len, "range": range, "str": str, "int": int, "float": float,
        "list": list, "dict": dict, "tuple": tuple, "set": set, "bool": bool,
        "sum": sum, "min": min, "max": max, "round": round, "abs": abs,
        "sorted": sorted, "enumerate": enumerate, "zip": zip, "map": map,
        "filter": filter, "isinstance": isinstance, "type": type, "print": print,
        "True": True, "False": False, "None": None,
    }
    namespace = {
        "__builtins__": safe_builtins,
        "data": data,
        "config": custom_params,
    }
    exec(code, namespace)

    if "transform" in namespace:
        return namespace["transform"](data, custom_params)
    elif "result" in namespace:
        return namespace["result"]
    return data


@register_block("notify")
async def notify_block(config, inputs, context):
    """Send notification."""
    return {
        "title": config.get("title", "Notification"),
        "message": config.get("message", ""),
        "type": config.get("type", "info"),
    }


@register_block("fft")
async def fft_block(config, inputs, context):
    """FFT analysis."""
    data = list(inputs.values())[0] if inputs else []
    if not data: return []
    col = config.get("column", "")
    sample_rate = config.get("sample_rate", 1)

    import numpy as np
    values = [float(r.get(col, 0) or 0) for r in data if isinstance(r, dict)]
    if len(values) < 4: return data

    fft_vals = np.fft.rfft(values)
    freqs = np.fft.rfftfreq(len(values), d=1.0/sample_rate)
    magnitudes = np.abs(fft_vals)

    return [{"frequency": float(f), "magnitude": float(m)} for f, m in zip(freqs, magnitudes)]


@register_block("moving_average")
async def moving_average_block(config, inputs, context):
    """Moving average smoothing."""
    data = list(inputs.values())[0] if inputs else []
    if not data: return []
    col = config.get("column", "")
    window = int(config.get("window", 10))

    values = [float(r.get(col, 0) or 0) for r in data if isinstance(r, dict)]
    if len(values) < window: return data

    import numpy as np
    smoothed = np.convolve(values, np.ones(window)/window, mode='valid')

    result = []
    for i, val in enumerate(smoothed):
        row = dict(data[i + window - 1]) if i + window - 1 < len(data) else {}
        row[f"{col}_smoothed"] = float(val)
        result.append(row)
    return result


@register_block("anomaly_detection")
async def anomaly_detection_block(config, inputs, context):
    """Detect anomalies."""
    data = list(inputs.values())[0] if inputs else []
    if not data: return []
    col = config.get("column", "")
    method = config.get("method", "zscore")
    threshold = float(config.get("threshold", 2.0))

    import numpy as np
    values = [float(r.get(col, 0) or 0) for r in data if isinstance(r, dict)]
    if len(values) < 3: return data

    arr = np.array(values)
    if method == "zscore":
        mean, std = np.mean(arr), np.std(arr)
        scores = np.abs((arr - mean) / (std + 1e-10))
    elif method == "iqr":
        q1, q3 = np.percentile(arr, [25, 75])
        iqr = q3 - q1
        scores = np.where((arr < q1 - threshold * iqr) | (arr > q3 + threshold * iqr), 1, 0).astype(float)
        threshold = 0.5
    else:
        scores = np.zeros(len(arr))

    for i, row in enumerate(data):
        if isinstance(row, dict) and i < len(scores):
            row["_anomaly"] = bool(scores[i] > threshold)
            row["_anomaly_score"] = float(scores[i])
    return data
