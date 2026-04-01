# Feature: Org Admin Panel

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Org admins manage users within their organization only. Cannot see other orgs. The `/admin` page shows org info + user CRUD scoped to `org_id`.

## How

### Pages
- `/admin` — Org name/plan display, user table, create user form

### Existing API (already org-scoped from Sprint 2 #8)
- `GET /api/users` — list users in my org (org admin)
- `POST /api/users` — create user in my org
- `DELETE /api/users/[id]` — delete user in my org
- `PATCH /api/users/[id]` — update role/password

### Key Rules
- Org admin sees ONLY their org's users
- Cannot create super_admin users
- Cannot modify users outside their org
- Delete/patch verifies target user belongs to same org

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | org_id from JWT, filter all queries |
| V4.2.1 | IDOR prevention | Verify target user's org_id matches requester's org_id |
