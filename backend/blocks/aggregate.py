"""
AggregateBlock — computes rollups (avg, min, max, count, sum).

Input:  ctx.query_result (records with 'value' field)
Output: ctx.aggregated (dict)
"""

from .base import Block, PipelineContext


class AggregateBlock(Block):
    name = "Aggregate"

    def __init__(self, functions: list[str] | None = None):
        self.functions = functions or ["avg", "min", "max", "count"]

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        values = [r["value"] for r in ctx.query_result if "value" in r]

        if not values:
            ctx.aggregated = {fn: None for fn in self.functions}
            return ctx

        result = {}
        for fn in self.functions:
            if fn == "avg":
                result["avg"] = sum(values) / len(values)
            elif fn == "min":
                result["min"] = min(values)
            elif fn == "max":
                result["max"] = max(values)
            elif fn == "count":
                result["count"] = len(values)
            elif fn == "sum":
                result["sum"] = sum(values)

        ctx.aggregated = result
        return ctx
