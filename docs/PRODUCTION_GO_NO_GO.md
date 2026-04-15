# POSflyt / Vessa — Production Go / No-Go Checklist (v1.0-rc.0)

This document defines the **minimum safety gates required before promoting any release to production**.

If ANY section fails → DO NOT DEPLOY.

---

## 1. Build & CI Gate (Hard Block)

### CI Pipeline

- [ ] `ci.yml` is GREEN on the exact commit being deployed
- [ ] Backend tests pass (unit + integration)
- [ ] Prisma validation passes in CI
- [ ] Frontend build succeeds (no runtime errors)

### Required Evidence

- CI run ID: __________
- Commit SHA: __________

---

## 2. Migration Safety Gate (Hard Block)

### Prisma State

- [ ] `npx prisma validate` passes
- [ ] `prisma migrate deploy` runs successfully in staging
- [ ] No migration drift between:
  - `schema.prisma`
  - `_prisma_migrations` table in staging DB

### Rules

- [ ] NO `prisma migrate reset` in production environment
- [ ] All migrations are forward-only
- [ ] No manual DB edits without migration file

### Required Evidence

- Staging migration run: PASS / FAIL
- Drift detected: YES / NO

---

## 3. API Health Gate (Hard Block)

### Core Health Checks

- [ ] `GET /health` returns 200
- [ ] DB connection status = "connected"
- [ ] No critical error spikes in logs

### Smoke Tests (must pass)

- [ ] Auth login works (JWT issued)
- [ ] One protected endpoint returns 200
- [ ] One write operation succeeds (transaction or sale)

---

## 4. Financial Integrity Gate (Hard Block)

### Required Guarantees

- [ ] Idempotency enforced on transaction creation
- [ ] No duplicate transaction creation under retry simulation
- [ ] Ledger projection matches transaction totals in staging

### Test Coverage Must Pass

- [ ] `expense.integration.test.js`
- [ ] `multi-payment.integration.test.js`
- [ ] `integrityIngest.integration.test.js`
- [ ] `return.integration.test.js`

---

## 5. Webhook Safety Gate (Critical Block)

### External Payment Systems

- [ ] Webhook signature verification ENABLED in staging
- [ ] Duplicate webhook delivery tested (idempotent handling)
- [ ] No double credit / double marking of payment

### Required Env (Production)

- `REQUIRE_BILLING_WEBHOOK_SIGNATURE=true`

---

## 6. Offline / Sync Safety Gate (Critical Block)

### Offline Queue

- [ ] Offline transactions persist locally correctly
- [ ] Reconnection sync does NOT duplicate transactions
- [ ] Conflict resolution tested (same product updated offline + server)

---

## 7. Observability Gate (Required)

### Monitoring

- [ ] `/health` endpoint monitored externally
- [ ] Error tracking enabled (Sentry or equivalent)
- [ ] Backend logs accessible in production

### Minimum Alerts

- [ ] `/health` returns non-200
- [ ] Error rate spike (5xx increase)

### Post-deploy drift (recommended)

- [ ] Scheduled or manual `npm run drift:monitor` (from `backend/`) passes — see [`DRIFT_MONITORING.md`](./DRIFT_MONITORING.md)

---

## 8. Security Gate (Hard Block)

### Authentication

- [ ] `JWT_SECRET` set in production environment
- [ ] No fallback dev secrets in env.js

### CORS

- [ ] Explicit allowed origins only (no `*`)

### Admin Access

- [ ] Admin routes protected by role middleware

---

## 9. Deployment Gate (Final Block)

### Pre-Deploy

- [ ] `npm run predeploy-check` passes
- [ ] `prisma-safety-check.js` passes
- [ ] `prisma migrate deploy` staged successfully

### GitHub Actions (automated enforcement)

- [ ] **`CI` workflow** completed successfully for the **same commit SHA** you are shipping (see `.github/workflows/ci.yml`: env guard, predeploy, guarded `migrate deploy`, tests).
- [ ] **Production deploy** (`.github/workflows/deploy-production.yml`): commit is **tagged** with an allowed release tag **before** `workflow_dispatch`; workflow verifies green CI + tag (rollback path is unchanged).

### Post-Deploy

- [ ] `/health` checked manually
- [ ] One real transaction flow tested
- [ ] No immediate error spike (5–10 min observation)

---

## 10. Chaos System (Must Be OFF)

- [ ] `CHAOS_ENGINE_ENABLED !== true`
- [ ] `CHAOS_ENGINE_ALLOW_PRODUCTION !== true`

Chaos testing is **staging-only by default**.

---

# GO / NO-GO DECISION RULE

## GO (Safe to Deploy)

ALL sections pass → proceed to production deploy via:

`deploy-production.yml`

## NO-GO (Block Release)

ANY failure → fix, re-test in staging, re-run checklist

---

# Engineering Principle

This system prioritizes:

1. Data correctness > uptime
2. Idempotency > speed
3. Traceability > convenience
4. Migration safety > feature delivery

---

## Related

- When a gate fails in production or staging, use [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md) for detection, containment, and recovery steps.
