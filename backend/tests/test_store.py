import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from blocks.base import PipelineContext
from blocks.store import StoreBlock


@pytest.mark.asyncio
async def test_store_dryrun():
    block = StoreBlock()  # No DB → dry-run
    ctx = PipelineContext(records=[
        {"device_id": "s1", "metric": "temp", "value": 28.5, "timestamp": "2026-03-24T10:00:00+00:00"},
        {"device_id": "s1", "metric": "temp", "value": 28.3, "timestamp": "2026-03-24T10:01:00+00:00"},
    ])
    ctx = await block.execute(ctx)
    assert ctx.ok
    assert ctx.events[0]["type"] == "store_dryrun"
    assert ctx.events[0]["count"] == 2


@pytest.mark.asyncio
async def test_store_empty_records():
    block = StoreBlock()
    ctx = PipelineContext(records=[])
    ctx = await block.execute(ctx)
    assert ctx.ok
    assert len(ctx.events) == 0
