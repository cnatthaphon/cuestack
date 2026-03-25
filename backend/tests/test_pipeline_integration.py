import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from blocks.base import PipelineContext
from pipelines import (
    create_ingest_pipeline, create_query_pipeline,
    create_summary_pipeline, create_export_pipeline,
)


@pytest.mark.asyncio
async def test_ingest_pipeline_valid():
    pipeline = create_ingest_pipeline()
    ctx = PipelineContext(raw_data=[
        {"device_id": "s1", "timestamp": "2026-03-24T10:00:00Z", "value": 28.5},
    ])
    ctx = await pipeline.run(ctx)
    assert ctx.ok
    assert len(ctx.records) == 1
    assert ctx.events[0]["type"] == "store_dryrun"


@pytest.mark.asyncio
async def test_ingest_pipeline_invalid():
    pipeline = create_ingest_pipeline()
    ctx = PipelineContext(raw_data=[{"bad": "data"}])
    ctx = await pipeline.run(ctx)
    assert not ctx.ok
    assert len(ctx.events) == 0  # Store never ran


@pytest.mark.asyncio
async def test_query_pipeline():
    pipeline = create_query_pipeline()
    ctx = await pipeline.run(PipelineContext(raw_data={}))
    assert ctx.ok
    assert ctx.response["count"] == 3
    assert "avg" in ctx.response["aggregated"]


@pytest.mark.asyncio
async def test_summary_pipeline():
    pipeline = create_summary_pipeline()
    ctx = await pipeline.run(PipelineContext(raw_data={}))
    assert ctx.ok
    assert ctx.response["pipeline"] == "summary"
    assert "sum" in ctx.response["aggregated"]


@pytest.mark.asyncio
async def test_export_pipeline():
    pipeline = create_export_pipeline()
    ctx = await pipeline.run(PipelineContext(raw_data={}))
    assert ctx.ok
    assert "device_id" in ctx.response  # CSV header
    assert "28.5" in ctx.response
