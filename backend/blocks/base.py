"""
Simulink-style block pipeline for IoT data processing.

Same pattern as SyncMD — each block has execute(ctx), pipeline wires them together.
PipelineContext is the shared data bus between blocks (like Simulink signals).
"""

from dataclasses import dataclass, field
from typing import Any
from datetime import datetime, timezone


@dataclass
class PipelineContext:
    """Shared data bus flowing through the pipeline."""

    # Tenant
    org_id: str | None = None  # Organization ID — injected from JWT, never from user input

    # Input
    raw_data: Any = None
    device_id: str | None = None
    timestamp: datetime | None = None

    # Processed
    records: list = field(default_factory=list)
    query_result: list = field(default_factory=list)

    # Aggregation
    aggregated: dict = field(default_factory=dict)

    # Output
    response: Any = None
    errors: list = field(default_factory=list)
    events: list = field(default_factory=list)

    # Metadata
    pipeline_name: str = ""
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


class Block:
    """Base block — override execute(ctx) to implement."""

    name: str = "Block"

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        raise NotImplementedError

    def __repr__(self):
        return f"<{self.name}>"


class Pipeline:
    """Wires blocks together in sequence. Stops on error unless force=True."""

    def __init__(self, name: str, blocks: list[Block]):
        self.name = name
        self.blocks = blocks

    async def run(self, ctx: PipelineContext | None = None, force: bool = False) -> PipelineContext:
        if ctx is None:
            ctx = PipelineContext()
        ctx.pipeline_name = self.name

        for block in self.blocks:
            ctx = await block.execute(ctx)
            if not ctx.ok and not force:
                break

        return ctx

    def __repr__(self):
        chain = " → ".join(b.name for b in self.blocks)
        return f"Pipeline({self.name}: {chain})"
