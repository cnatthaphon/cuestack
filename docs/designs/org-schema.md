# Feature: Organization Schema + Org-Scoped Users

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Multi-tenancy foundation. Add `organizations` table and `org_id` to `users` table. Two-level admin: super_admin (Demo) manages orgs, org_admin manages users within their org.

This is the #1 lesson from AA2's Gen6 audit: data isolation must be built into the schema from day one. Every query, every API call filters by `org_id`. No exceptions.

## How

### Database Schema

```sql
-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,        -- URL-friendly: "factory-a"
    plan VARCHAR(20) DEFAULT 'free',         -- free, pro, enterprise
    storage_limit_mb INTEGER DEFAULT 1000,   -- per-org storage quota
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (updated)
ALTER TABLE users ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT false;

-- Sensor data (updated)
ALTER TABLE sensor_data ADD COLUMN org_id UUID NOT NULL;
CREATE INDEX idx_sensor_org_device_ts ON sensor_data (org_id, device_id, timestamp DESC);
```

### Role Hierarchy

```
super_admin (is_super_admin=true, org_id=NULL)
  └── Can manage all orgs, all users, platform-wide

org_admin (role='admin', org_id='xxx')
  └── Can manage users within their org only

org_editor (role='editor', org_id='xxx')
  └── Can ingest/query data within their org

org_viewer (role='viewer', org_id='xxx')
  └── Can view dashboards within their org
```

### Key Rules

1. `org_id` is injected from JWT — user never sends it
2. Every DB query includes `WHERE org_id = $X`
3. Super admin has `is_super_admin=true` and `org_id=NULL`
4. Super admin uses separate `/super/*` routes
5. Org users cannot see other orgs' data, users, or config

### Seed Data (dev)

```
Org: "Demo" (slug: "demo")
  Super admin: admin/admin (is_super_admin=true)

Org: "Demo" (slug: "demo")
  Org admin: demo/demo (role: admin)
```

## API Changes

None yet — schema only. API routes updated in later issues.

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_org_create` | Insert org with UUID, slug, defaults |
| `test_user_belongs_to_org` | User has org_id foreign key |
| `test_super_admin_no_org` | Super admin has org_id=NULL, is_super_admin=true |
| `test_sensor_data_has_org_id` | sensor_data includes org_id column |
| `test_org_unique_slug` | Duplicate slug rejected |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | org_id from JWT, not user input |
| V4.2.1 | No cross-org data access | Every query filters by org_id |
| V2.5.4 | No default creds in prod | Seed only in dev (SEED_DATA env var) |
| V5.3.4 | Parameterized queries | All SQL uses $1, $2 placeholders |
