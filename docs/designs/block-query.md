# Feature: QueryBlock + AggregateBlock + FormatBlock

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Three blocks for the query pipeline:
- **QueryBlock**: reads time-series data from PostgreSQL with filters
- **AggregateBlock**: computes rollups (avg, min, max, count, sum)
- **FormatBlock**: formats output as JSON, CSV, or summary

## How

### QueryBlock
- **Input:** `ctx.raw_data` (query params: device_id, metric, start, end, limit)
- **Output:** `ctx.query_result` (list of records)
- Demo mode when no DB configured

### AggregateBlock
- **Input:** `ctx.query_result`
- **Output:** `ctx.aggregated` (dict with avg, min, max, etc.)
- **Config:** `functions` list

### FormatBlock
- **Input:** `ctx.query_result` + `ctx.aggregated`
- **Output:** `ctx.response` (JSON dict, CSV string, or summary)
- **Config:** `output_format` ("json", "csv", "summary")

### Pipeline Integration
```
QUERY:   [QueryBlock] → [AggregateBlock] → [FormatBlock(json)]
SUMMARY: [QueryBlock] → [AggregateBlock] → [FormatBlock(summary)]
EXPORT:  [QueryBlock] → [AggregateBlock] → [FormatBlock(csv)]
```

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_query_demo` | Demo mode returns sample data |
| `test_aggregate_all` | avg/min/max/count/sum computed |
| `test_aggregate_empty` | Empty input → all None |
| `test_format_json` | JSON format with data + aggregated |
| `test_format_csv` | CSV string with headers |
| `test_format_summary` | Summary with pipeline name |
| `test_full_query_pipeline` | Query → Aggregate → Format end-to-end |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | Auth checked before pipeline runs |
| V5.3.4 | Parameterized queries | All SQL uses $1, $2 placeholders |
