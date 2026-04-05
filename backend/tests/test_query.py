import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from blocks.aggregate import AggregateBlock
from blocks.base import Pipeline, PipelineContext
from blocks.format import FormatBlock
from blocks.query import QueryBlock


@pytest.mark.asyncio
async def test_query_demo_mode():
    block = QueryBlock()  # No DB → demo data
    ctx = PipelineContext(raw_data={})
    ctx = await block.execute(ctx)
    assert ctx.ok
    assert len(ctx.query_result) == 3
    assert ctx.query_result[0]["device_id"] == "sensor-01"


@pytest.mark.asyncio
async def test_aggregate_all_functions():
    block = AggregateBlock(functions=["avg", "min", "max", "count", "sum"])
    ctx = PipelineContext(query_result=[
        {"value": 10.0}, {"value": 20.0}, {"value": 30.0},
    ])
    ctx = await block.execute(ctx)
    assert ctx.aggregated["avg"] == pytest.approx(20.0)
    assert ctx.aggregated["min"] == 10.0
    assert ctx.aggregated["max"] == 30.0
    assert ctx.aggregated["count"] == 3
    assert ctx.aggregated["sum"] == pytest.approx(60.0)


@pytest.mark.asyncio
async def test_aggregate_empty():
    block = AggregateBlock()
    ctx = PipelineContext(query_result=[])
    ctx = await block.execute(ctx)
    assert ctx.aggregated["avg"] is None
    assert ctx.aggregated["count"] is None


@pytest.mark.asyncio
async def test_format_json():
    block = FormatBlock("json")
    ctx = PipelineContext(
        query_result=[{"value": 1}, {"value": 2}],
        aggregated={"avg": 1.5},
    )
    ctx = await block.execute(ctx)
    assert ctx.response["count"] == 2
    assert ctx.response["aggregated"]["avg"] == 1.5


@pytest.mark.asyncio
async def test_format_csv():
    block = FormatBlock("csv")
    ctx = PipelineContext(
        query_result=[
            {"device_id": "s1", "value": 28.5},
            {"device_id": "s1", "value": 28.3},
        ]
    )
    ctx = await block.execute(ctx)
    assert "device_id" in ctx.response
    assert "28.5" in ctx.response


@pytest.mark.asyncio
async def test_format_summary():
    block = FormatBlock("summary")
    ctx = PipelineContext(
        query_result=[{"value": 1}],
        aggregated={"avg": 1.0},
        pipeline_name="test-summary",
    )
    ctx = await block.execute(ctx)
    assert ctx.response["pipeline"] == "test-summary"
    assert ctx.response["record_count"] == 1


@pytest.mark.asyncio
async def test_full_query_pipeline():
    pipeline = Pipeline("query", [
        QueryBlock(),
        AggregateBlock(),
        FormatBlock("json"),
    ])
    ctx = await pipeline.run(PipelineContext(raw_data={}))
    assert ctx.ok
    assert ctx.response["count"] == 3
    assert ctx.response["aggregated"]["avg"] == pytest.approx(28.3)
