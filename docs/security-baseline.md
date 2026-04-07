# Security Baseline (Ops-Side)

## Login Boundary

- `POST /auth/login` has an aggressive per-IP+email rate limit.
- Rate-limit response must remain structured and include request ID.

## Token Policy

Current baseline:

- Access token remains short-lived and signed with `JWT_SECRET`.
- Refresh-token strategy is documented as staged rollout; when enabled it must include revocation and rotation controls.

## Runtime Security Controls

- Helmet is enabled globally.
- CORS is environment-controlled through `CORS_ORIGIN`.
- Request IDs are propagated to support forensic tracing.

## Secrets Management Checklist

- [ ] No plaintext secrets committed to repository.
- [ ] Environment variable inventory is maintained (`docs/environments.md`).
- [ ] Owners assigned for each secret set.
- [ ] Rotation cadence defined (90 days baseline).
- [ ] Emergency rotation runbook known by on-call owner.

## Phase 7.2 additions

- **Input sanitization** for user-supplied text stored in DB (`backend/src/utils/sanitize.js`).
- **Security audit events**: failed password login (`AUTH_LOGIN_FAILED_INVALID_PASSWORD`); unknown-email attempts logged via structured logger (no DB row without `businessId`).
- **Helmet**: explicit production HSTS, referrer policy, cross-domain Flash/Silverlight policies disabled, `CORP` for API+CORS.
- **Frontend CSP** (Vercel): `vercel.json` security headers; React remains default-safe for XSS.
- **CI**: backend `npm audit --audit-level=high` required; frontend audit runs as informational when upstream has advisories.

See **`docs/phase-7.2-security-compliance.md`** for the full Phase 7.2 narrative.

## Verification Checklist

1. Repeated login attempts trigger rate limiting.
2. CORS headers match expected staging/production origins.
3. Helmet headers are present in runtime responses.
4. No hardcoded secrets appear in code review scans.
5. CSP and security headers present on frontend host (see `vercel.json`).
