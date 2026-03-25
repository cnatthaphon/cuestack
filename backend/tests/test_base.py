import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from blocks.base import Block, PipelineContext, Pipeline


@pytest.mark.asyncio
async def test_block_execute_not_implemented():
    block = Block()
    ctx = PipelineContext()
    with pytest.raises(NotImplementedError):
        await block.execute(ctx)


@pytest.mark.asyncio
async def test_context_ok_when_no_errors():
    ctx = PipelineContext()
    assert ctx.ok is True


@pytest.mark.asyncio
async def test_context_not_ok_when_errors():
    ctx = PipelineContext(errors=["something went wrong"])
    assert ctx.ok is False


@pytest.mark.asyncio
async def test_pipeline_runs_blocks_in_sequence():
    class AddBlock(Block):
        name = "Add"
        async def execute(self, ctx):
            ctx.records.append("added")
            return ctx

    class DoubleBlock(Block):
        name = "Double"
        async def execute(self, ctx):
            ctx.records = ctx.records * 2
            return ctx

    pipeline = Pipeline("test", [AddBlock(), DoubleBlock()])
    ctx = await pipeline.run()
    assert ctx.records == ["added", "added"]
    assert ctx.pipeline_name == "test"


@pytest.mark.asyncio
async def test_pipeline_stops_on_error():
    class ErrorBlock(Block):
        name = "Error"
        async def execute(self, ctx):
            ctx.errors.append("fail")
            return ctx

    class NeverReached(Block):
        name = "Never"
        async def execute(self, ctx):
            ctx.records.append("should not appear")
            return ctx

    pipeline = Pipeline("test", [ErrorBlock(), NeverReached()])
    ctx = await pipeline.run()
    assert not ctx.ok
    assert len(ctx.records) == 0


@pytest.mark.asyncio
async def test_pipeline_force_continues_past_errors():
    class ErrorBlock(Block):
        name = "Error"
        async def execute(self, ctx):
            ctx.errors.append("fail")
            return ctx

    class StillRuns(Block):
        name = "Still"
        async def execute(self, ctx):
            ctx.records.append("ran anyway")
            return ctx

    pipeline = Pipeline("test", [ErrorBlock(), StillRuns()])
    ctx = await pipeline.run(force=True)
    assert not ctx.ok
    assert ctx.records == ["ran anyway"]


@pytest.mark.asyncio
async def test_pipeline_repr():
    class A(Block):
        name = "Alpha"
    class B(Block):
        name = "Beta"

    pipeline = Pipeline("test", [A(), B()])
    assert "Alpha → Beta" in repr(pipeline)
    assert "test" in repr(pipeline)
