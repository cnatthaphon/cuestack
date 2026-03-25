# Feature: StoreBlock + sensor_data Table

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

StoreBlock writes validated records to PostgreSQL. Creates `sensor_data` table for time-series storage. This is where ingest pipeline data lands.

In Sprint 2, StoreBlock will be swapped to ClickHouse — same interface, different backend.

## How

### Database Schema

```sql
CREATE TABLE sensor_data (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    metric VARCHAR(100) DEFAULT 'unknown',
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sensor_device_ts ON sensor_data (device_id, timestamp DESC);
```

### StoreBlock
- **Input:** `ctx.records` (validated/transformed)
- **Output:** `ctx.events` [{type: "stored", count: N}] or `ctx.errors`
- **Config:** `db_url` (connection string)
- Uses parameterized queries only — no string concatenation (ASVS V5.3.4)
- Dry-run mode when no DB configured (for unit tests)

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_store_dryrun` | No DB → counts records, emits dryrun event |
| `test_store_empty` | Empty records → no-op |
| `test_store_to_db` | Records inserted to PostgreSQL (integration test) |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V5.3.4 | Parameterized queries | All SQL uses $1, $2 placeholders |
| V5.3.5 | No SQL injection | No string concatenation in queries |
