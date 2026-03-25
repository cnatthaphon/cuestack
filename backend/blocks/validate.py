"""
ValidateBlock — checks incoming sensor data has required fields and valid types.

Input:  ctx.raw_data (list of dicts or single dict)
Output: ctx.records (list of validated records) or ctx.errors

Security: ASVS V5.1.3 (input validation), V13.1.1 (JSON schema)
"""

from datetime import datetime
from .base import Block, PipelineContext

REQUIRED_FIELDS = {"device_id", "timestamp", "value"}


class ValidateBlock(Block):
    name = "Validate"

    def __init__(self, required_fields: set[str] | None = None):
        self.required_fields = required_fields or REQUIRED_FIELDS

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        data = ctx.raw_data
        if data is None:
            ctx.errors.append("No data provided")
            return ctx

        rows = data if isinstance(data, list) else [data]

        validated = []
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                ctx.errors.append(f"Row {i}: expected dict, got {type(row).__name__}")
                continue

            missing = self.required_fields - set(row.keys())
            if missing:
                ctx.errors.append(f"Row {i}: missing fields: {missing}")
                continue

            ts = row.get("timestamp")
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    ctx.errors.append(f"Row {i}: invalid timestamp '{ts}'")
                    continue
            elif not isinstance(ts, datetime):
                ctx.errors.append(f"Row {i}: timestamp must be string or datetime")
                continue

            val = row.get("value")
            if not isinstance(val, (int, float)):
                ctx.errors.append(f"Row {i}: value must be numeric, got {type(val).__name__}")
                continue

            validated.append({**row, "timestamp": ts, "value": float(val)})

        ctx.records = validated
        if not validated and not ctx.errors:
            ctx.errors.append("No valid records after validation")

        return ctx
