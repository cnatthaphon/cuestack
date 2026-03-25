"""
QueryBlock — reads time-series data from PostgreSQL.

Input:  ctx.raw_data (query params: device_id, metric, start, end, limit)
Output: ctx.query_result (list of records)

Security: ASVS V5.3.4 (parameterized queries)
"""

from .base import Block, PipelineContext

SAMPLE_DATA = [
    {"timestamp": "2026-03-24T10:00:00Z", "device_id": "sensor-01", "metric": "temperature", "value": 28.5},
    {"timestamp": "2026-03-24T10:01:00Z", "device_id": "sensor-01", "metric": "temperature", "value": 28.3},
    {"timestamp": "2026-03-24T10:02:00Z", "device_id": "sensor-01", "metric": "temperature", "value": 28.1},
]


class QueryBlock(Block):
    name = "Query"

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        params = ctx.raw_data or {}

        if not self.db_pool:
            ctx.query_result = SAMPLE_DATA
            return ctx

        try:
            async with self.db_pool.acquire() as conn:
                # Build parameterized query (ASVS V5.3.4)
                conditions = []
                values = []
                idx = 1

                if params.get("device_id"):
                    conditions.append(f"device_id = ${idx}")
                    values.append(params["device_id"])
                    idx += 1

                if params.get("metric"):
                    conditions.append(f"metric = ${idx}")
                    values.append(params["metric"])
                    idx += 1

                if params.get("start"):
                    conditions.append(f"timestamp >= ${idx}")
                    values.append(params["start"])
                    idx += 1

                if params.get("end"):
                    conditions.append(f"timestamp <= ${idx}")
                    values.append(params["end"])
                    idx += 1

                where = " AND ".join(conditions) if conditions else "TRUE"
                limit = min(int(params.get("limit", 100)), 1000)

                sql = f"SELECT device_id, metric, value, timestamp FROM sensor_data WHERE {where} ORDER BY timestamp DESC LIMIT ${idx}"
                values.append(limit)

                rows = await conn.fetch(sql, *values)
                ctx.query_result = [dict(row) for row in rows]
        except Exception as e:
            ctx.errors.append(f"Query failed: {e}")

        return ctx
