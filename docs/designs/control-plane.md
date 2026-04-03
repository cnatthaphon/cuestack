# Design: Federated Control Plane

> Status: Planned — current single-server design supports this without changes.

## Problem

When CueStack runs on multiple servers (e.g., TH region + EU region), super admins need to manage all servers from one place without logging into each separately.

## Architecture

```
Central Control (admin.cuestack.com)
  │  SSO login (one time)
  │
  ├── API calls ──→ TH Server (th.cuestack.com)
  │                  All data stays HERE
  │                  Local admin works normally
  │
  └── API calls ──→ EU Server (eu.cuestack.com)
                     All data stays HERE
                     Local admin works normally
```

### Key Principles

1. **Central is a remote control, not a data store** — no data duplication, no sync
2. **Each server works standalone** — central is optional, not required
3. **Data stays on target server** — GDPR/PDPA compliance by design
4. **No conflict** — central and local admin call the same API on the same server
5. **SSO for super admins only** — org users authenticate locally per server

## Auth Model

| Who | Auth Method | Scope |
|-----|------------|-------|
| Super admin | SSO (OIDC/JWT via central) | All servers |
| Org admin | Local JWT (per server) | Their server only |
| Org member | Local JWT (per server) | Their server only |

## Control Plane Components

```
Central Control:
  - Simple dashboard (list servers, status, quick actions)
  - No database — stores server URLs + access tokens only
  - SSO provider (Keycloak, or custom JWT issuer)
  - Calls satellite /api/super/* endpoints remotely

Satellite Server (existing CueStack):
  - No changes needed to current design
  - /api/super/* already exists
  - Accepts JWT tokens (extend to accept external SSO tokens)
  - All 7 services run independently
```

## Server-to-Server Auth

Central authenticates to satellites via:
- Server API token (shared secret, stored on central only)
- Or OIDC token from shared SSO provider

Satellites validate the token and check `is_super_admin` claim.

## What Exists Now (no changes needed)

- Super admin API: `/api/super/orgs`, `/api/super/stats`, etc.
- JWT-based auth (extendable to external tokens)
- Org user isolation (per server, per org)
- All data in PostgreSQL + ClickHouse (per server)

## What to Build Later

1. Central dashboard (simple Next.js app, 2 Docker containers)
2. Server registration (URL + token per satellite)
3. SSO integration (Keycloak or custom JWT issuer)
4. Health monitoring (ping each satellite's `/api/health`)

## Not Needed

- Data sync between servers
- Shared database
- Message queues between servers
- Complex consensus protocols
