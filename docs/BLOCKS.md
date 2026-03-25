# Block Documentation

## Overview

IoT Stack uses a Simulink-style block pipeline architecture. Every data operation flows through a chain of composable blocks. Each block has one job, receives a `PipelineContext`, and passes it forward.

## PipelineContext

Shared data bus between blocks:

| Field | Type | Description |
|-------|------|-------------|
| `raw_data` | Any | Raw input (MQTT message, API body, query params) |
| `device_id` | str | Device identifier |
| `timestamp` | datetime | Event time |
| `records` | list | Validated/transformed records |
| `query_result` | list | Query output |
| `aggregated` | dict | Aggregation results |
| `response` | Any | Final formatted output |
| `errors` | list | Error messages (stops pipeline if non-empty) |
| `events` | list | Side effects (store confirmations, alerts) |
| `ok` | bool | `True` if no errors |

## Blocks

*Blocks will be added via feature branches. Each block gets its own design doc, MR, and tests.*

| Block | Branch | Status |
|-------|--------|--------|
| Base (Block, Pipeline, PipelineContext) | `feature/block-base` | Planned |
| ValidateBlock | `feature/block-validate` | Planned |
| TransformBlock | `feature/block-validate` | Planned |
| StoreBlock | `feature/block-store` | Planned |
| QueryBlock | `feature/block-query` | Planned |
| AggregateBlock | `feature/block-query` | Planned |
| FormatBlock | `feature/block-query` | Planned |

## Pipelines

| Pipeline | Blocks | Use Case |
|----------|--------|----------|
| `ingest` | Validate → Transform → Store | Sensor data ingestion |
| `query` | Query → Aggregate → Format(json) | Dashboard data fetch |
| `summary` | Query → Aggregate → Format(summary) | Quick stats |
| `export` | Query → Aggregate → Format(csv) | Data export |

## Adding a New Block

1. Create design doc: `docs/designs/my-block.md` (from template)
2. Get design approved via MR
3. Implement: `backend/blocks/my_block.py`
4. Test: `backend/tests/test_my_block.py`
5. Wire into pipeline: `backend/pipelines.py`
6. Update this doc
7. MR to staging
