"""
StoreBlock — writes records to ClickHouse (generalized data events).

Input:  ctx.records (validated/transformed)
Output: ctx.events (store confirmation) or ctx.errors

Any data goes in — sensor readings, API responses, webhook payloads, service output.
All stored as: timestamp, org_id, channel, source, payload (JSON).
"""

import json
import os
from datetime import datetime, timezone

import httpx

from .base import Block, PipelineContext

CLICKHOUSE_URL = os.getenv("CLICKHOUSE_URL", "http://clickhouse:8123")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "cuestack")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "cuestack")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "cuestack123")


class StoreBlock(Block):
    name = "Store"

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        if not ctx.records:
            return ctx

        try:
            rows = []
            for record in ctx.records:
                ts = record.get("timestamp", datetime.now(timezone.utc).isoformat())
                org_id = ctx.metadata.get("org_id", "00000000-0000-0000-0000-000000000000")
                channel = ctx.metadata.get("channel", "default")
                source = ctx.metadata.get("source", "pipeline")
                payload = json.dumps({k: v for k, v in record.items() if k != "timestamp"})
                rows.append(f"('{ts}', '{org_id}', '{channel}', '{source}', 'data', '{payload}', '{{}}')")

            if rows:
                values = ",\n".join(rows)
                query = f"""INSERT INTO data_events (timestamp, org_id, channel, source, event_type, payload, metadata)
                VALUES {values}"""

                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        CLICKHOUSE_URL,
                        params={"database": CLICKHOUSE_DB, "query": query},
                        auth=(CLICKHOUSE_USER, CLICKHOUSE_PASSWORD),
                        timeout=30.0,
                    )
                    resp.raise_for_status()

                ctx.events.append({"type": "stored", "count": len(rows), "target": "clickhouse"})
        except Exception as e:
            ctx.errors.append(f"Store failed: {e}")

        return ctx
