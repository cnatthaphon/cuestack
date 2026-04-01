# Feature: Pipeline Wiring + API Routes

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Wire all blocks into pipelines and expose via FastAPI routes. This connects the blocks (built in #1-#4) into working data endpoints.

## How

### pipelines.py — factory functions
- `create_ingest_pipeline()` → Validate → Transform → Store
- `create_query_pipeline()` → Query → Aggregate → Format(json)
- `create_summary_pipeline()` → Query → Aggregate → Format(summary)
- `create_export_pipeline()` → Query → Aggregate → Format(csv)

### FastAPI routes
- `POST /api/pipeline/ingest` — ingest sensor data
- `GET /api/pipeline/query` — query with filters
- `GET /api/pipeline/summary` — aggregated stats
- `GET /api/pipeline/info` — list all pipelines

### Auth
Pipeline routes check JWT from Next.js cookie via shared SECRET_KEY. FastAPI validates the token server-side before running the pipeline.

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | JWT verified before pipeline runs |
| V14.4.3 | Security headers | Set by nginx |
| V14.5.3 | CORS allowlist | FastAPI CORS middleware, no wildcard in prod |
