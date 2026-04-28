# Security Standards

CueStack follows security-first development. Every feature addresses relevant security standards from the start — unlike retrofitting, which is expensive and error-prone.

Reference: [Security Standards Overview (Issue #39770)](https://support.demo.com/issues/39770)

## Standards

| Standard | Scope | Priority |
|----------|-------|----------|
| **OWASP ASVS L1** | Web app security (129 items) | Core — every feature maps to this |
| **ETSI EN 303 645** | IoT cybersecurity (13 provisions) | ~80% overlap with ASVS |
| **GDPR / PDPA** | Data protection law | Must-have — legal requirement |
| **IEC 62443-4-1** | Secure development lifecycle | Our git workflow + CI + design-first |
| **WCAG 2.2 AA** | Accessibility (56 criteria) | Sprint 3 — dashboard phase |

## Cross-Cutting Controls

These appear in 4/5 standards. Do once, cover all:

### Authentication (ASVS V2 + V3)
- Password hashing: bcrypt (cost 12+) or argon2
- No default credentials in production
- No hardcoded secrets — use environment variables
- Password policy: ≥12 chars, no charset restriction
- Session tokens: crypto random ≥64 bits
- Cookie flags: Secure, HttpOnly, SameSite=Strict
- Session timeout + logout invalidation
- Rate limiting / brute-force protection

### Encryption (ASVS V6 + V9)
- TLS 1.2+ on all connections
- No plaintext sensitive data in transit
- Encrypt personal data at rest (AES-256)
- Strong cipher suites only

### Input Validation (ASVS V5 + V13)
- Parameterized queries — no string concatenation SQL
- Output encoding — prevent XSS
- JSON schema validation on API inputs
- File upload: type + size validation
- SSRF / path traversal prevention

### Access Control (ASVS V4)
- Server-side checks on every endpoint
- IDOR prevention — verify ownership before returning data
- CSRF protection (SameSite cookies or tokens)
- Role-based access: admin, editor, viewer
- Principle of least privilege

### Infrastructure (ASVS V14)
- Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- CORS: strict allowlist (no wildcard `*` in production)
- Debug mode off in production
- Error messages: no internal details exposed
- Dependencies up to date

## Data Protection (GDPR / PDPA)

- Consent management for personal data
- Data export API (portability)
- Data deletion API (right to erasure)
- Audit logging: who accessed what, when
- No personal data in log files
- Retention period + auto-delete
- 72-hour breach notification process

## Secure Development (IEC 62443-4-1)

Our workflow already implements this:

| IEC Practice | How We Do It |
|-------------|--------------|
| Security Management | Security section in every design doc |
| Requirements & Design | Threat modeling in design phase, ASVS mapping |
| Secure Coding | Code review, lint, no eval/exec |
| Testing & Validation | pytest per block, pipeline integration tests, CI |
| Vulnerability Management | Dependency updates, .env for secrets |
| Documentation | SECURITY.md, design docs, API docs |

## Per-Feature Security Checklist

Every design doc must include a Security section:

```markdown
## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V2.1.1 | No hardcoded credentials | Env vars via .env |
| V5.1.3 | Parameterized queries | SQLAlchemy ORM |
| V14.4.3 | Security headers | nginx config |
```
