"""
StoreBlock — writes records to PostgreSQL (→ ClickHouse in Sprint 2).

Input:  ctx.records (validated/transformed)
Output: ctx.events (store confirmation) or ctx.errors

Security: ASVS V5.3.4 (parameterized queries), V5.3.5 (no SQL injection)
"""

from .base import Block, PipelineContext

SENSOR_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    metric VARCHAR(100) DEFAULT 'unknown',
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_device_ts ON sensor_data (device_id, timestamp DESC);
"""

INSERT_SQL = """
INSERT INTO sensor_data (device_id, metric, value, timestamp)
VALUES ($1, $2, $3, $4)
"""


class StoreBlock(Block):
    name = "Store"

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        if not ctx.records:
            return ctx

        if not self.db_pool:
            ctx.events.append({"type": "store_dryrun", "count": len(ctx.records)})
            return ctx

        try:
            async with self.db_pool.acquire() as conn:
                # Ensure table exists
                await conn.execute(SENSOR_TABLE_DDL)
                # Insert records — parameterized queries only (ASVS V5.3.4)
                count = 0
                for record in ctx.records:
                    await conn.execute(
                        INSERT_SQL,
                        record.get("device_id"),
                        record.get("metric", "unknown"),
                        record["value"],
                        record["timestamp"],
                    )
                    count += 1
                ctx.events.append({"type": "stored", "count": count})
        except Exception as e:
            ctx.errors.append(f"Store failed: {e}")

        return ctx
