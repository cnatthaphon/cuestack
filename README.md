# CueStack

> **Status:** Active Development | Not production-ready yet

Multi-tenant platform for IoT data, dashboards, notebooks, and automation — built with Next.js, FastAPI, PostgreSQL, MQTT, and Docker.

## What It Does

CueStack is a self-hosted platform where organizations manage IoT devices, build dashboards, run notebooks, and automate data pipelines — all isolated per tenant.

```
Devices (MQTT) → Data Pipeline → Storage → Dashboards / Notebooks / API
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────┐    ┌────────────────────────────────┐     │
│  │  nginx   │───→│  Next.js (full-stack frontend)  │     │
│  │  :8080   │    │  Auth, pages, dashboards,       │     │
│  │          │    │  workspace, API routes           │     │
│  │          │    └──────────────┬─────────────────┘     │
│  │          │                   │                        │
│  │ /api/    │    ┌──────────────▼─────────────────┐     │
│  │ pipeline │───→│  FastAPI (data service)         │     │
│  │          │    │  Pipelines, transforms, ML,     │     │
│  │          │    │  scheduled jobs, MQTT bridge     │     │
│  │          │    └──────────────┬─────────────────┘     │
│  │          │                   │                        │
│  │ /jupyter │    ┌──────────────▼─────────────────┐     │
│  │          │───→│  JupyterLab (notebooks)         │     │
│  └──────────┘    │  Python SDK, DB-backed storage  │     │
│                   └────────────────────────────────┘     │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────┐       │
│  │ PostgreSQL   │    │  Mosquitto (MQTT broker)  │       │
│  │ Users, data, │    │  Device ingestion         │       │
│  │ dashboards   │    │  WebSocket live data      │       │
│  └──────────────┘    └──────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

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
- MQTT device ingestion
- Block-based pipeline: Validate → Transform → Store → Query
- Scheduled jobs and automation services
- REST API with channel tokens

**Developer Tools**
- Python SDK for notebooks (`from iot_stack import connect`)
- JavaScript SDK for HTML widgets
- API key management
- WebSocket live data channels

## Quick Start

```bash
git clone https://github.com/cnatthaphon/cuestack.git
cd cuestack
cp .env.example .env
docker compose up --build -d

# Open http://localhost:8080
```

6 services start automatically:

| Service | Port | Purpose |
|---------|------|---------|
| nginx | 8080 | Reverse proxy (main entry) |
| frontend | 3000 | Next.js UI |
| backend | 8000 | FastAPI data service |
| jupyter | 8888 | Notebook editor |
| db | 5432 | PostgreSQL |
| mqtt | 1883/9001 | MQTT broker + WebSocket |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19 |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 |
| Notebooks | JupyterLab 4 + custom Python SDK |
| MQTT | Eclipse Mosquitto 2 |
| Reverse Proxy | nginx |
| Containerization | Docker Compose |
| Auth | JWT (HS256), bcrypt, RBAC |

## Security

Built with security in mind:
- OWASP ASVS L1 compliance
- Multi-tenant data isolation (every query filters by org_id)
- JWT authentication with short-lived tokens
- Parameterized queries (no SQL injection)
- bcrypt password hashing
- Strict CORS, no debug in production
- Channel tokens for device/API access

## Project Structure

```
cuestack/
├── frontend/          # Next.js — UI, auth, API routes
│   ├── app/           # Pages (App Router)
│   ├── lib/           # Auth, DB, components, features
│   └── public/        # Static assets, SDK
├── backend/           # FastAPI — data pipelines, scheduler
│   ├── main.py        # App entry, WebSocket, API
│   ├── channels.py    # Real-time data channels
│   └── services/      # Pipeline blocks, ML
├── jupyter/           # JupyterLab container
│   └── iot_stack/     # Python SDK
├── mqtt/              # Mosquitto config
├── nginx/             # Reverse proxy config
└── docker-compose.yml
```

## License

MIT
