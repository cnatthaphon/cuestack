# IoT Stack — Block Pipeline Platform

Multi-service IoT platform with Simulink-style block pipeline architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Docker Compose                                           │
│                                                          │
│  ┌──────────┐    ┌────────────────────────────────┐     │
│  │  nginx   │───→│  Next.js (full-stack)           │     │
│  │  :8080   │    │  Auth, pages, user management   │     │
│  │          │    │  API gateway → PostgreSQL        │     │
│  │          │    └────────────────────────────────┘     │
│  │          │                                            │
│  │ /api/    │    ┌────────────────────────────────┐     │
│  │ pipeline │───→│  FastAPI (pipeline service)     │     │
│  │          │    │  Data: validate, transform,     │     │
│  │          │    │  store, query, aggregate, ML    │     │
│  └──────────┘    └───────────────┬────────────────┘     │
│                                   │                      │
│                       ┌───────────▼──────────┐          │
│                       │  PostgreSQL :5432     │          │
│                       │  users + sensor_data  │          │
│                       └──────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

**Next.js** = everything a user touches (auth, pages, permissions)
**FastAPI** = everything data touches (pipelines, ML) — Python ecosystem
**Rust** = everything that needs speed (MQTT ingestion, Sprint 2)

### Block Pipeline

Every data operation flows through composable blocks:

```
INGEST:   Validate → Transform → Store
QUERY:    Query → Aggregate → Format(json)
SUMMARY:  Query → Aggregate → Format(summary)
EXPORT:   Query → Aggregate → Format(csv)
```

Same pattern as [SyncMD](https://github.com/cnatthaphon/syncmd) — each block is one file, one class, one job.

## Quick Start

```bash
cp .env.example .env    # edit credentials
docker compose up --build -d
# Open http://localhost:8080
```

## Security

Security-first development following OWASP ASVS L1. Every feature design doc includes a Security section mapping to ASVS requirements. See [Security Standards Overview](docs/SECURITY.md) for full details.

Standards addressed:
- **OWASP ASVS L1** — web app security (129 items)
- **ETSI EN 303 645** — IoT cybersecurity (~80% overlap with ASVS)
- **GDPR / PDPA** — data protection
- **IEC 62443-4-1** — secure development lifecycle
- **WCAG 2.2 AA** — accessibility (Sprint 3)

## Roadmap

- **Sprint 1** — Next.js (auth + pages) + FastAPI (pipelines) + PostgreSQL + Docker
- **Sprint 2** — ClickHouse + MQTT broker + Rust ingestor
- **Sprint 3** — WebSocket live dashboard + ML service + WCAG accessibility

## Docs

- [Block Documentation](docs/BLOCKS.md)
- [API Documentation](docs/API.md)
- [Security Standards](docs/SECURITY.md)
- [Contributing Guide](docs/CONTRIBUTING.md)

## Stack

Next.js 15, FastAPI, PostgreSQL 16, SQLAlchemy, nginx, Docker Compose
