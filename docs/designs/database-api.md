# Feature: Database Management + External API

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Orgs manage their own database tables through UI and access data via external API with API keys. Two database types:
- **Analytical (time-series):** PostgreSQL now, ClickHouse later — for sensor data, metrics, logs
- **Transactional:** PostgreSQL — for app data, orders, inventory

External systems (sensors, ERPs, other apps) use API keys to push/pull data without logging in.

## How

### Database Schema

```sql
-- Org's custom tables registry
CREATE TABLE org_tables (
    id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    db_type VARCHAR(20) NOT NULL DEFAULT 'analytical',  -- analytical | transactional
    columns JSONB NOT NULL,  -- [{name, type, nullable, default}]
    description VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, name)
);

-- API keys per org
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,      -- SHA-256 hashed key
    key_prefix VARCHAR(10) NOT NULL,     -- first 8 chars for identification
    permissions JSONB DEFAULT '[]',       -- which tables + read/write
    rate_limit INTEGER,                   -- requests/min (NULL = org plan default)
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);
```

### Supported Column Types

| Type | PostgreSQL | Future ClickHouse |
|------|-----------|-------------------|
| `text` | VARCHAR | String |
| `integer` | INTEGER | Int32 |
| `float` | DOUBLE PRECISION | Float64 |
| `boolean` | BOOLEAN | Bool |
| `timestamp` | TIMESTAMPTZ | DateTime |
| `json` | JSONB | String (JSON) |

### Table Creation Flow

1. Org admin goes to `/admin` → Databases tab
2. Clicks "Create Table", enters name + columns
3. API creates entry in `org_tables` + creates real PostgreSQL table
4. Real table name: `org_{org_id_short}_{table_name}` (prevents collision)
5. All queries to this table auto-filter by org_id

### API Key Flow

1. Org admin goes to `/admin` → API Keys tab
2. Creates key with name + table permissions (read/write per table)
3. System generates `isk_` prefixed key, shows once, stores hash
4. External system uses: `Authorization: Bearer isk_xxxxx`

### External API

```
POST /api/v1/data/{table_name}     — insert rows
GET  /api/v1/data/{table_name}     — query rows
GET  /api/v1/tables                — list accessible tables
```

### Rate Limiting

| Plan | Default Rate Limit |
|------|-------------------|
| free | 100 requests/min |
| pro | 1000 requests/min |
| enterprise | 10000 requests/min |

Configurable per API key (overrides plan default).

## API Routes

### Database Management (Next.js, auth cookie)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/tables` | db.view | List org's tables |
| POST | `/api/tables` | db.create | Create table |
| PATCH | `/api/tables/[id]` | db.edit | Update description |
| DELETE | `/api/tables/[id]` | db.delete | Drop table |

### API Key Management (Next.js, auth cookie)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/keys` | org.settings | List API keys |
| POST | `/api/keys` | org.settings | Create API key |
| DELETE | `/api/keys/[id]` | org.settings | Revoke API key |

### External Data API (API key auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/tables` | API key | List accessible tables |
| POST | `/api/v1/data/[table]` | API key | Insert rows |
| GET | `/api/v1/data/[table]` | API key | Query rows |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V2.10.1 | API key hashed | SHA-256 hash stored, plaintext shown once |
| V4.1.1 | Access control | API key permissions per table |
| V4.2.1 | Data isolation | All queries include org_id, table names org-prefixed |
| V5.3.4 | Parameterized queries | All SQL uses $1, $2 |
| V11.1.4 | Rate limiting | Per API key, defaults from org plan |
| V13.1.1 | Input validation | Column types validated, table names sanitized |
