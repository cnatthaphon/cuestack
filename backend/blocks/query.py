"""
QueryBlock — reads time-series data from ClickHouse.

Input:  ctx.raw_data (query params: channel, source, start, end, limit, offset)
Output: ctx.query_result (list of records)

Security: ASVS V5.3.4 (parameterized queries via ClickHouse HTTP interface)
"""

import clickhouse_client

from .base import Block, PipelineContext


class QueryBlock(Block):
    name = "Query"

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        params = ctx.raw_data or {}
        org_id = ctx.metadata.get("org_id") if ctx.metadata else None

        if not org_id:
            ctx.errors.append("Query failed: org_id required")
            return ctx

        try:
            channel = params.get("channel")
            source = params.get("source")
            start = params.get("start")
            end = params.get("end")
            limit = min(int(params.get("limit", 100)), 1000)

            ctx.query_result = await clickhouse_client.query_events(
                org_id=org_id,
                channel=channel,
                source=source,
                start=start,
                end=end,
                limit=limit,
            )
        except Exception as e:
            ctx.errors.append(f"Query failed: {e}")

        return ctx
