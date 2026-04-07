# Phase 7.2 — Security, privacy, and compliance readiness

This document summarizes **implemented technical controls** and **organizational next steps** for POSflyt. It supports GDPR-style privacy-by-design thinking and security questionnaires; it is **not** legal advice.

## Strategic imperatives (mapped)

| Imperative | How we address it |
|------------|-------------------|
| Proactive threat mitigation | Sanitized inputs, hardened HTTP headers, rate limits (Phase 6.x), Helmet, CSP on static host, dependency audits in CI |
| Data privacy assurance | Data inventory below, minimization via narrow API fields, TLS via hosting, audit logs for auth failures (where applicable) |
| Regulatory compliance | Documented controls + runbooks; framework-specific legal review is out of band |
| Building trust | Transparent docs, incident runbook links, no secrets in repo |

## 7.2.1 — Advanced security hardening (implemented)

### Input validation and sanitization

- **Zod `.strict()`** on mutating controllers (Phase 6.x).
- **`backend/src/utils/sanitize.js`**: strips HTML-like tags, control characters, length caps; applied to registration, products, customers, settings (business fields), and support issue text.
- **Prisma** continues to parameterize SQL (injection risk reduced at the query layer).

### Output encoding and CSP

- **React** escapes text by default; **`src/utils/safeDisplay.js`** provides `escapeHtml` / `encodeUriComponentSafe` for URL or future rich rendering.
- **`vercel.json`**: `Content-Security-Policy` and companion headers for the SPA (tune `connect-src` if you use non-HTTPS APIs).

### Secure configuration

- **Helmet** (backend): HSTS in production, `Referrer-Policy`, `Cross-Origin-Resource-Policy`, Adobe cross-domain policies disabled, CSP disabled for JSON API (no HTML).
- **Secrets**: remain in environment variables; see `docs/security-baseline.md` and `backend/.env.example`.

### Vulnerability management

- **CI**: `npm audit --audit-level=high` on **backend** (fails the job on new high issues).
- **CI**: same audit on **frontend** with `continue-on-error: true` while upstream toolchain advisories are resolved (still visible in logs).

### Supply chain

- Lockfiles (`package-lock.json`) + `npm ci` in CI.
- Branch protection and review processes remain **repository settings** (see `docs/branch-protection.md`).

## 7.2.2 — Data privacy and protection

### Data classification (summary)

| Class | Examples | Controls |
|-------|-----------|----------|
| Public | Marketing copy | N/A in API DB |
| Internal | Aggregated metrics | Auth + role checks |
| Confidential / PII | User email, name, phone, business name | Auth, TLS, DB access control, sanitization |
| Security-sensitive | Password hashes, refresh tokens | Bcrypt, HttpOnly cookies, session revocation |

### Inventory (high level)

| Data | Location | Purpose | Retention |
|------|----------|---------|-----------|
| Account / business | Postgres | Service delivery | Account lifetime |
| Sessions / refresh | Postgres | Authentication | Configurable TTL |
| Transactions / products | Postgres | POS operations | Business retention policy (define per tenant) |
| Audit logs | Postgres | Security / ops | Define policy (e.g. 12–24 months) |
| Application logs | Host / provider | Debugging | Per provider settings |

**Encryption in transit:** HTTPS on Vercel/Render; clients use `VITE_API_URL` over TLS.

**Encryption at rest:** Rely on **Neon / host** disk encryption; application-level field encryption is a future product decision.

### RBAC and least privilege

- Roles (`ADMIN`, `MANAGER`, `CASHIER`, etc.) enforced in middleware and services; integration tests cover several denial paths.

### MFA

- Not implemented in this phase; track as a product backlog item for admin accounts.

## 7.2.3 — Compliance and auditing

### Audit trail

- **`AuditLog`** for many mutations; **failed password login** (known user) writes `AUTH_LOGIN_FAILED_INVALID_PASSWORD`.
- **Unknown email** login attempts: structured **warn** log only (no `businessId` to attach to DB row).

### Incident response

- See **`docs/incident-runbook.md`** and RACI in **`docs/mvp-runbook-raci.md`**.

### External audits / pen tests

- Schedule **periodic** third-party reviews when customer contracts require them; not automated in code.

## Verification checklist

1. Sanitization: submit HTML in product name; stored value has no tags.
2. CSP: load SPA; verify devtools shows CSP header on Vercel.
3. Backend audit: `npm audit` in `backend` passes at configured level.
4. Failed login: wrong password produces audit row with `AUTH_LOGIN_FAILED_INVALID_PASSWORD` for an existing user.

## References

- `docs/security-baseline.md`
- `docs/adr/002-auth-session-model.md`
- `docs/incident-runbook.md`
