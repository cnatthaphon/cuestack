"""
TransformBlock — applies unit conversions, adds computed fields.

Input:  ctx.records (validated records)
Output: ctx.records (transformed records)
"""

from .base import Block, PipelineContext


class TransformBlock(Block):
    name = "Transform"

    def __init__(self, conversions: dict | None = None):
        self.conversions = conversions or {}

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        transformed = []
        for record in ctx.records:
            row = {**record}
            for field_name, fn in self.conversions.items():
                if field_name in row:
                    row[field_name] = fn(row[field_name])
            row.setdefault("metric", "unknown")
            transformed.append(row)

        ctx.records = transformed
        return ctx
