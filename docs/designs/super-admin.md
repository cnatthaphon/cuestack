# Feature: Super Admin Panel

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Platform-wide admin panel for Aimagin staff. Manage organizations, view storage usage, create org admins. Accessible only to super_admin users at `/super`.

Completely separate from org dashboards — different route, different UI, different data scope.

## How

### Pages

- `/super` — Overview: org count, total users, total storage
- `/super` includes: org list table, create org form, org detail (users + storage)

### API Routes (Next.js)

All require `is_super_admin=true`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/super/orgs` | List all organizations |
| POST | `/api/super/orgs` | Create organization |
| DELETE | `/api/super/orgs/[id]` | Delete org + all data |
| PATCH | `/api/super/orgs/[id]` | Update org (name, plan, storage limit, active) |
| GET | `/api/super/orgs/[id]/users` | List users in org |
| POST | `/api/super/orgs/[id]/users` | Create user in org |
| GET | `/api/super/stats` | Platform stats (org count, user count) |

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_create_org` | POST creates org with UUID + slug |
| `test_list_orgs` | GET returns all orgs |
| `test_delete_org` | DELETE removes org + cascades users |
| `test_create_user_in_org` | POST creates user with correct org_id |
| `test_non_super_rejected` | Org admin gets 403 on /api/super/* |
| `test_stats` | Returns correct org/user counts |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | `is_super_admin` check on every /api/super/* route |
| V4.1.2 | No privilege escalation | Org admin cannot access super routes |
| V2.5.4 | No default creds in prod | Super admin seeded only when SEED_DATA != false |
