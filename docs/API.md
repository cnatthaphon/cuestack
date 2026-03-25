# API Documentation

Base URL: `http://localhost:8080`

## Services

| Service | Routes | Responsibility |
|---------|--------|---------------|
| Next.js | `/api/auth/*`, `/api/users/*` | Auth, users, permissions, web API |
| FastAPI | `/api/pipeline/*`, `/api/health` | Data pipelines, ML |

## Endpoints

### Health

| Method | Endpoint | Auth | Service | Description |
|--------|----------|------|---------|-------------|
| GET | `/api/health` | No | FastAPI | Pipeline service health |

### Auth (Next.js) — *feature/auth*

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/auth/logout` | Yes | Invalidate session |
| GET | `/api/auth/me` | Yes | Current user info |

### Pipeline (FastAPI) — *feature/pipelines*

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/pipeline/ingest` | Yes | Ingest sensor data |
| GET | `/api/pipeline/query` | Yes | Query time-series data |
| GET | `/api/pipeline/summary` | Yes | Aggregated summary |
| GET | `/api/pipeline/info` | No | List pipelines and blocks |

*Detailed request/response schemas will be added as each feature branch is merged.*
