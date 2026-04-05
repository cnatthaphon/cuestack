"""
FormatBlock — formats pipeline output for API response.

Input:  ctx.query_result + ctx.aggregated
Output: ctx.response (JSON dict, CSV string, or summary)
"""

import csv
import io

from .base import Block, PipelineContext


class FormatBlock(Block):
    name = "Format"

    def __init__(self, output_format: str = "json"):
        self.output_format = output_format

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        if self.output_format == "csv":
            ctx.response = self._to_csv(ctx.query_result)
        elif self.output_format == "summary":
            ctx.response = {
                "aggregated": ctx.aggregated,
                "record_count": len(ctx.query_result),
                "pipeline": ctx.pipeline_name,
            }
        else:
            ctx.response = {
                "data": ctx.query_result,
                "aggregated": ctx.aggregated if ctx.aggregated else None,
                "count": len(ctx.query_result),
            }
        return ctx

    def _to_csv(self, records: list) -> str:
        if not records:
            return ""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)
        return output.getvalue()
