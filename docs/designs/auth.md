# Feature: Authentication & User Management

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Authentication system built into Next.js (full-stack). Handles login, sessions, user CRUD, and role-based access control. This is the foundation — every other feature depends on auth.

FastAPI does NOT handle auth. It receives pre-validated requests from Next.js via internal network.

## How

### Architecture

```
Browser → nginx → Next.js API routes → PostgreSQL (users table)
                  ├── POST /api/auth/login     → verify password, create JWT
                  ├── POST /api/auth/logout     → invalidate session
                  ├── GET  /api/auth/me         → return current user
                  └── middleware                 → check JWT on protected pages
```

### Password Security

- Hash: bcrypt with cost factor 12 (ASVS V2.4.1)
- Policy: minimum 8 chars, no charset restriction (ASVS V2.1.1)
- No default credentials in production — admin account seeded only in dev (ASVS V2.5.4)

### Session / Token

- JWT signed with HS256, secret from `SECRET_KEY` env var
- Token expiry: 24 hours
- HttpOnly cookie (not localStorage) — prevents XSS token theft (ASVS V3.4.2)
- SameSite=Strict — CSRF protection (ASVS V3.4.3)
- Secure flag in production (ASVS V3.4.1)

### Rate Limiting

- Login: max 5 attempts per minute per IP (ASVS V2.2.1)
- After 5 failures: 60-second lockout

### Roles

| Role | Permissions |
|------|------------|
| admin | All — manage users, manage data, view dashboard |
| editor | Manage data, view dashboard |
| viewer | View dashboard only |

### Database Schema

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Seed Data (dev only)

```
username: admin, password: admin, role: admin
```

Production: `SEED_ADMIN=false` env var disables auto-seed.

## API Changes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login → returns JWT in HttpOnly cookie |
| POST | `/api/auth/logout` | Yes | Clears session cookie |
| GET | `/api/auth/me` | Yes | Current user info |
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users` | Admin | Create user |
| DELETE | `/api/users/[id]` | Admin | Delete user |
| PATCH | `/api/users/[id]` | Admin | Update role/password |

## UI Changes

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Username/password form |
| Dashboard | `/` | Protected — redirects to /login if no session |
| Admin | `/admin` | User management (admin role only) |

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_login_success` | Valid credentials → JWT cookie set |
| `test_login_wrong_password` | Bad password → 401 |
| `test_login_rate_limit` | 6th attempt within 1 min → 429 |
| `test_me_with_token` | Valid JWT → returns user info |
| `test_me_no_token` | No JWT → 401 |
| `test_admin_create_user` | Admin can create new user |
| `test_viewer_cannot_create_user` | Viewer gets 403 on /api/users POST |
| `test_password_hashed` | Stored password is bcrypt hash, not plaintext |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V2.1.1 | Password min length | 8 chars minimum enforced |
| V2.1.2 | Allow ≥64 chars | No max length restriction |
| V2.1.7 | Check breached passwords | Planned (Sprint 2 — HaveIBeenPwned API) |
| V2.2.1 | Anti-brute-force | Rate limiting: 5/min per IP |
| V2.4.1 | Password hashing | bcrypt cost 12 |
| V2.5.4 | No default/hardcoded creds | Seed only in dev, env var to disable |
| V3.1.1 | Session token generation | crypto.randomUUID() for JWT jti |
| V3.4.1 | Cookie Secure flag | Set in production (HTTPS) |
| V3.4.2 | Cookie HttpOnly flag | Yes — no JS access to token |
| V3.4.3 | Cookie SameSite | Strict — CSRF prevention |
| V3.7.1 | Logout invalidates session | Cookie cleared + token blocklist |
| V4.1.1 | Server-side access control | Middleware checks role before handler |
| V4.1.2 | IDOR prevention | Users can only access own data |

## Questions

- [x] Use JWT in cookie vs localStorage? → Cookie (HttpOnly, more secure)
- [ ] Add refresh token flow? → Not for Sprint 1, revisit in Sprint 2
