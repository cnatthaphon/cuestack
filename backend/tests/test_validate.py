import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from blocks.base import Pipeline, PipelineContext
from blocks.transform import TransformBlock
from blocks.validate import ValidateBlock


@pytest.mark.asyncio
async def test_valid_data():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data=[
        {"device_id": "sensor-01", "timestamp": "2026-03-24T10:00:00Z", "value": 28.5},
        {"device_id": "sensor-01", "timestamp": "2026-03-24T10:01:00Z", "value": 28.3},
    ])
    ctx = await block.execute(ctx)
    assert ctx.ok
    assert len(ctx.records) == 2


@pytest.mark.asyncio
async def test_missing_fields():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data=[{"device_id": "sensor-01"}])
    ctx = await block.execute(ctx)
    assert not ctx.ok
    assert "missing fields" in ctx.errors[0]


@pytest.mark.asyncio
async def test_invalid_timestamp():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data=[
        {"device_id": "s1", "timestamp": "not-a-date", "value": 1.0},
    ])
    ctx = await block.execute(ctx)
    assert not ctx.ok


@pytest.mark.asyncio
async def test_non_numeric_value():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data=[
        {"device_id": "s1", "timestamp": "2026-03-24T10:00:00Z", "value": "hot"},
    ])
    ctx = await block.execute(ctx)
    assert not ctx.ok
    assert "numeric" in ctx.errors[0]


@pytest.mark.asyncio
async def test_no_data():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data=None)
    ctx = await block.execute(ctx)
    assert not ctx.ok


@pytest.mark.asyncio
async def test_single_dict_input():
    block = ValidateBlock()
    ctx = PipelineContext(raw_data={"device_id": "s1", "timestamp": "2026-03-24T10:00:00Z", "value": 1.0})
    ctx = await block.execute(ctx)
    assert ctx.ok
    assert len(ctx.records) == 1


@pytest.mark.asyncio
async def test_custom_required_fields():
    block = ValidateBlock(required_fields={"device_id", "timestamp", "value", "metric"})
    ctx = PipelineContext(raw_data=[
        {"device_id": "s1", "timestamp": "2026-03-24T10:00:00Z", "value": 1.0},
    ])
    ctx = await block.execute(ctx)
    assert not ctx.ok


@pytest.mark.asyncio
async def test_transform_conversion():
    pipeline = Pipeline("test", [
        ValidateBlock(),
        TransformBlock(conversions={"value": lambda v: v * 9 / 5 + 32}),
    ])
    ctx = PipelineContext(raw_data=[
        {"device_id": "s1", "timestamp": "2026-03-24T10:00:00Z", "value": 0.0},
    ])
    ctx = await pipeline.run(ctx)
    assert ctx.ok
    assert ctx.records[0]["value"] == pytest.approx(32.0)


@pytest.mark.asyncio
async def test_transform_no_conversion():
    block = TransformBlock()
    ctx = PipelineContext(records=[{"device_id": "s1", "value": 28.5}])
    ctx = await block.execute(ctx)
    assert ctx.records[0]["metric"] == "unknown"
    assert ctx.records[0]["value"] == 28.5
