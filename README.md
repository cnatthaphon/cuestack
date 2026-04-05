# CueStack

![Status](https://img.shields.io/badge/status-active%20development-brightgreen) ![Services](https://img.shields.io/badge/services-7-blue) ![License](https://img.shields.io/badge/license-MIT-green)

Multi-tenant platform for data, dashboards, notebooks, and automation — built with Next.js, FastAPI, PostgreSQL, ClickHouse, MQTT, and Docker.

## What It Does

CueStack is a self-hosted platform where organizations ingest data from any source, build dashboards, run notebooks, and automate pipelines — all isolated per tenant.

```
Any Source (MQTT, API, webhook, service, upload)
  → Channel (real-time broadcast)
  → ClickHouse (history + analytics)
  → Dashboards / Notebooks / API / SQLite Export
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Docker Compose (7 services)              │
│                                                               │
│  ┌──────────┐    ┌────────────────────────────────┐          │
│  │  nginx   │───→│  Next.js (full-stack frontend)  │          │
│  │  :8080   │    │  Auth, pages, dashboards,       │          │
│  │          │    │  workspace, API routes           │          │
│  │          │    └──────────────┬─────────────────┘          │
│  │          │                   │                             │
│  │ /api/    │    ┌──────────────▼─────────────────┐          │
│  │ pipeline │───→│  FastAPI (data service)         │          │
│  │          │    │  Pipelines, transforms, ML,     │          │
│  │          │    │  scheduled jobs, MQTT bridge     │          │
│  │          │    └──┬───────────────────────┬────┘          │
│  │          │       │                       │                │
│  │ /jupyter │    ┌──▼──────────┐    ┌──────▼───────────┐    │
│  │          │───→│ PostgreSQL  │    │   ClickHouse     │    │
│  └──────────┘    │ State:      │    │   History:       │    │
│                   │ users, orgs,│    │   data_events,   │    │
│  ┌──────────┐    │ pages, auth │    │   audit_log      │    │
│  │ Mosquitto│    └─────────────┘    └──────────────────┘    │
│  │ MQTT     │                                                │
│  │ broker   │    ┌─────────────────────────────────┐        │
│  └──────────┘    │  JupyterLab (notebooks)          │        │
│                   │  Python SDK, DB-backed storage   │        │
│                   └─────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

**PostgreSQL** = current state (users, orgs, pages, config)
**ClickHouse** = history of everything (data events + audit log, append-only)

## Features

**Multi-Tenancy**
- Organizations with isolated data
- Role-based access (super_admin / admin / member)
- Per-org user limits and feature flags

**Workspace Pages**
- Drag-and-drop dashboard widgets (charts, tables, gauges)
- HTML/CSS/JS editor with live preview
- Jupyter notebooks (DB-backed, Google Colab model)
- Markdown pages

**Data Pipeline**
- Ingest from any source: MQTT, REST API, webhook, scheduled jobs, manual upload
- Format-agnostic: JSON, binary, or custom format via pluggable decoders
- Block-based pipeline: Validate → Transform → Store → Query
- Every event auto-stored in ClickHouse (append-only history)

**History & Audit**
- All data events stored with timestamp, channel, source, payload
- Full audit log: who changed what, when, old/new values
- Query any point in time
- Export to SQLite for portable download

**Developer Tools**
- Python SDK for notebooks (`from cuestack import connect`)
- JavaScript SDK for HTML widgets
- API key management
- WebSocket live data channels
- Scheduled jobs and automation services

## Quick Start

```bash
git clone https://github.com/cnatthaphon/cuestack.git
cd cuestack
cp .env.example .env
docker compose up --build -d

# Open http://localhost:8080
```

7 services start automatically:

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 8080 | Reverse proxy (main entry) |
| frontend | 3000 | Next.js UI |
| backend | 8000 | FastAPI data service |
| clickhouse | 8123 | Time-series + audit storage |
| jupyter | 8888 | Notebook editor |
| db | 5432 | PostgreSQL (state) |
| mqtt | 1883/9001 | MQTT broker + WebSocket |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19 |
| Backend | FastAPI (Python 3.12) |
| State DB | PostgreSQL 16 |
| Analytics DB | ClickHouse 24 |
| Notebooks | JupyterLab 4 + custom Python SDK |
| MQTT | Eclipse Mosquitto 2 |
| Reverse Proxy | nginx |
| Containerization | Docker Compose |
| Auth | JWT (HS256), bcrypt, RBAC |

## Data Flow

```
Source (device, API, webhook, service)
  │
  ▼
Channel (publish)
  ├── WebSocket → live subscribers (real-time)
  └── ClickHouse → data_events table (history)
                      │
                      ├── Query (filter by org, channel, time range)
                      ├── Dashboard widgets (charts, gauges)
                      ├── Notebooks (Python SDK)
                      └── Export (SQLite download)
```

## Block Engine

CueStack uses a schema-driven block engine for visual programming. Every block is defined by a contract:

```json
{
  "type": "my_block",
  "configSchema": [...],
  "inputs": [...],
  "outputs": [...],
  "execute": "..."
}
```

Built-in blocks: MQTT Subscribe, Data Source, Filter, Transform, Aggregate, FFT, Moving Average, Anomaly Detection, Insert to DB, WS Broadcast, MQTT Publish, Chart, Custom Code, Notify.

Custom blocks: users write Python `transform(data, config)` functions in the Custom Code block, or register new block types via the block registry.

Block registry: `shared/block-registry.json` — single source of truth for both frontend UI and backend execution.

## Security

Built with security in mind:
- OWASP ASVS L1 compliance
- Multi-tenant data isolation (every query filters by org_id)
- JWT authentication with short-lived tokens
- Parameterized queries (no SQL injection)
- bcrypt password hashing
- Strict CORS, no debug in production
- Channel tokens for device/API access
- Full audit trail in ClickHouse

## Project Structure

```
cuestack/
├── frontend/             # Next.js — UI, auth, API routes
│   ├── app/              # Pages (App Router)
│   ├── lib/              # Auth, DB, components, features
│   └── public/           # Static assets, SDK
├── backend/              # FastAPI — data pipelines, scheduler
│   ├── main.py           # App entry, WebSocket, API
│   ├── channels.py       # Real-time data channels
│   ├── clickhouse_client.py  # ClickHouse async client
│   ├── export.py         # SQLite export
│   ├── blocks/           # Pipeline blocks (validate, transform, store, query)
│   └── services/         # Scheduled services, ML
├── shared/               # Shared definitions (block registry)
│   └── block-registry.json  # Block definitions for frontend + backend
├── clickhouse/           # ClickHouse init schema
│   └── init.sql          # data_events + audit_log tables
├── jupyter/              # JupyterLab container
│   └── cuestack/         # Python SDK
├── mqtt/                 # Mosquitto config
├── nginx/                # Reverse proxy config
└── docker-compose.yml    # 7 services
```

## License

MIT
