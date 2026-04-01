# Feature: Flexible Permission & Role Management

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Replace hardcoded role checks (`role === "admin"`) with a flexible permission system. Orgs can create custom roles with specific permissions. Default roles provided but customizable.

## How

### Database Schema

```sql
-- Available permissions (platform-wide, managed by super admin)
CREATE TABLE permissions (
    id VARCHAR(50) PRIMARY KEY,     -- e.g. "users.create"
    category VARCHAR(30) NOT NULL,  -- e.g. "users"
    description VARCHAR(200)
);

-- Roles per org (customizable)
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    is_default BOOLEAN DEFAULT false,  -- shown as option when creating users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, name)
);

-- Role ↔ Permission mapping
CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(50) REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Users now reference role_id instead of role string
ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id);
```

### Default Permissions

| ID | Category | Description |
|----|----------|-------------|
| `users.view` | users | View user list |
| `users.create` | users | Create new users |
| `users.edit` | users | Edit user roles/password |
| `users.delete` | users | Delete users |
| `data.ingest` | data | Send data to ingest pipeline |
| `data.query` | data | Query data from pipeline |
| `data.export` | data | Export data as CSV |
| `dashboard.view` | dashboard | View dashboards |
| `dashboard.create` | dashboard | Create dashboards |
| `dashboard.edit` | dashboard | Edit dashboards |
| `dashboard.publish` | dashboard | Publish dashboards |
| `devices.view` | devices | View device list |
| `devices.create` | devices | Register new devices |
| `devices.edit` | devices | Edit device config |
| `devices.delete` | devices | Remove devices |
| `org.settings` | org | Manage org settings |

### Default Roles (auto-created per org)

| Role | Permissions | Default |
|------|------------|---------|
| Admin | All permissions | Yes |
| Editor | data.*, dashboard.view/create/edit, devices.view | Yes |
| Viewer | data.query, dashboard.view, devices.view | Yes |

### Permission Check Flow

```
Request → JWT has user_id
  → getCurrentUser() returns user with role_id
  → getUserPermissions(role_id) returns ["users.view", "data.query", ...]
  → hasPermission(user, "users.create") → true/false
```

### API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/permissions` | Org Admin | List all available permissions |
| GET | `/api/roles` | Org Admin | List roles in org |
| POST | `/api/roles` | Org Admin | Create custom role |
| PATCH | `/api/roles/[id]` | Org Admin | Update role permissions |
| DELETE | `/api/roles/[id]` | Org Admin | Delete custom role |

### UI

- `/admin` → "Roles" tab alongside "Users" tab
- Create role: name + checkbox grid of permissions
- Edit role: toggle permissions on/off
- When creating a user, select from org's roles (dropdown)

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V4.1.1 | Server-side access control | `hasPermission()` check on every endpoint |
| V4.1.2 | No privilege escalation | Cannot grant permissions you don't have |
| V4.2.1 | IDOR prevention | Roles scoped to org_id |
