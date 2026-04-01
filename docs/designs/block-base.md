# Feature: Block Base — Pipeline, PipelineContext, Block

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Foundation classes for the Simulink-style block pipeline. Every data operation in CueStack flows through a chain of blocks. This feature provides the base classes that all blocks inherit from.

Same pattern as SyncMD — proven architecture, applied to IoT data processing.

## How

### Block Design

Three classes in `backend/blocks/base.py`:

**Block** — base class for all blocks
- Override `async execute(ctx) → ctx`
- Has a `name` property for logging/display

**PipelineContext** — shared data bus (like Simulink signals)
- `raw_data` — raw input (MQTT message, API body, query params)
- `records` — validated/transformed records
- `query_result` — query output
- `aggregated` — aggregation results
- `response` — final formatted output
- `errors` — error list (stops pipeline if non-empty)
- `events` — side effects (alerts, store confirmations)
- `ok` — property, `True` if no errors

**Pipeline** — wires blocks in sequence
- `run(ctx)` — executes each block, stops on error (unless `force=True`)
- `__repr__()` — shows chain: `Pipeline(ingest: Validate → Transform → Store)`

### Pipeline Integration

This is the foundation — no pipeline integration yet. Other blocks will build on this.

```
Future:
INGEST:   Validate → Transform → Store
QUERY:    Query → Aggregate → Format
```

## API Changes

None — backend internal only.

## UI Changes

None.

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_block_execute` | Block.execute raises NotImplementedError |
| `test_context_ok` | ctx.ok is True when no errors |
| `test_context_errors` | ctx.ok is False when errors exist |
| `test_pipeline_run` | Pipeline runs blocks in sequence |
| `test_pipeline_stops_on_error` | Pipeline stops at first error block |
| `test_pipeline_force` | Pipeline continues past errors with force=True |
| `test_pipeline_repr` | Pipeline repr shows block chain |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| N/A | Framework code — no user input, no DB, no network | Security applied at block level (ValidateBlock, StoreBlock, etc.) |

## Questions

- [x] Sync or async? → Async — FastAPI is async, blocks should match
