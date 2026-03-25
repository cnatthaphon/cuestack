# Feature: Dashboard with Pipeline Data

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Update the dashboard to call pipeline API endpoints. Show sensor data table, summary cards, and ingest form. Completes the Sprint 1 data loop: ingest → store → query → display.

## How

### Dashboard (/)
- Summary cards: avg, min, max, count from `/api/pipeline/summary`
- Data table from `/api/pipeline/query`
- "Send Test Data" form → `/api/pipeline/ingest`
- Sprint progress checklist (all checked)

### Data Flow
```
[Send Data form] → POST /api/pipeline/ingest → Validate → Transform → Store → PostgreSQL
[Dashboard load] → GET /api/pipeline/summary → Query → Aggregate → Format → Summary cards
                 → GET /api/pipeline/query   → Query → Aggregate → Format → Data table
```

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V14.4.1 | CSP headers | nginx Content-Security-Policy |
| V14.4.7 | No eval() | No dynamic code execution |
| V3.4.2 | HttpOnly cookies | Cookies not accessible from JS |
