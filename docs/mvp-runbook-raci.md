# POSflyt MVP — RACI, measurable checklist & runbook

This document ties the engineering backlog to **accountable owners** and **verifiable criteria**. Update dates when items flip status.

| Role | Meaning |
|------|--------|
| **R** | Responsible (does the work) |
| **A** | Accountable (single approver / owns outcome) |
| **C** | Consulted |
| **I** | Informed |

Solo mode: one person holds **R** for most tasks; **A** should still be explicit (often the same person).

---

## RACI (MVP lane)

| Area | Task cluster | R | A | C | I |
|------|----------------|----|----|----|----|
| **Ops / deploy** | Env vars, Render/Vercel/Neon, schema apply | Lead Dev | Lead Dev | — | Stakeholders |
| **Data** | Prisma schema, migrations vs `db push` policy | Lead Dev | Lead Dev | — | — |
| **Security** | CORS, JWT, rate limits, Helmet | Lead Dev | Lead Dev | Security review | — |
| **Sync** | Offline queue, idempotent transactions | Lead Dev | Lead Dev | — | — |
| **Billing** | Paystack webhooks, payment history | Lead Dev | Lead Dev | — | — |
| **Observability** | Sentry, logs, health checks | Lead Dev | Lead Dev | — | — |
| **QA** | CI, smoke E2E | Lead Dev | Lead Dev | — | — |

---

## Measurable checklist (by priority)

Use **Done** / **Partial** / **Not started**. Evidence = link to PR, doc section, or command output.

### P1 — Production legibility (Control)

| # | Criterion | Target | Status |
|---|------------|--------|--------|
| **C1** | `DATABASE_URL` and `JWT_SECRET` set on backend host | No boot without DB | ☐ |
| **C2** | Schema applied in production (same process every deploy) | Documented in `docs/deployment-production.md` | ☐ |
| **C3** | Sentry DSN on FE + BE (optional but recommended) | Errors visible in Sentry project | ☐ |
| **C4** | Release tags: `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` match deploy | Stack traces symbolize | ☐ |
| **C5** | `GET /health` returns 200 for load balancers | Uptime monitor green | ☐ |
| **C6** | `CORS_ORIGIN` lists production frontend origin(s) only | No wildcard in prod | ☐ |

### P2 — Sync + data contract (Flow + Architecture)

| # | Criterion | Target | Status |
|---|------------|--------|--------|
| **S1** | Transaction idempotency key: `client_transaction_id` = server UUID | Duplicate replay returns duplicate, no double stock | ☐ |
| **S2** | ADR for sync conflicts & idempotency | `docs/adr/001-sync-idempotency.md` | ☐ |
| **S3** | DB strategy documented: `migrate deploy` vs dev-only `db push` | `docs/deployment-production.md`, `docs/deployment-phase-3.1.md` | ☐ |
| **S4** | IndexedDB: versioned schema + migration path | **Deferred** if staying on `idb` for MVP | ☐ |

### P3 — Security (Baseline)

| # | Criterion | Target | Status |
|---|------------|--------|--------|
| **B1** | `POST /auth/login` rate-limited | Brute-force mitigated | ☐ |
| **B2** | Helmet + JSON body on API | OWASP baseline | ☐ |
| **B3** | Mutating routes reject malformed bodies (Zod) | Controllers or `validateBody` | ☐ |
| **B4** | Auth session model documented | `docs/adr/002-auth-session-model.md` | ☐ |

### P4 — Billing / webhooks (Gateways)

| # | Criterion | Target | Status |
|---|------------|--------|--------|
| **G1** | Paystack webhook verifies signature (when secret set) | 401 on bad signature | ☐ |
| **G2** | Webhook processing idempotent for same `providerRef` | Second POST = success, no duplicate subscription writes | ☐ |

### P5 — Proof (Reliability)

| # | Criterion | Target | Status |
|---|------------|--------|--------|
| **P1** | CI green on PR + main | GitHub Actions | ☐ |
| **P2** | Smoke E2E passes | Playwright smoke | ☐ |
| **P3** | Offline sync E2E (stretch) | Queue → online → no duplicate | ☐ |

---

## Quick operator runbook (10-minute recovery)

1. **Backend won’t start:** Check `DATABASE_URL`, `JWT_SECRET`, `PORT` on Render (or host).  
2. **401 / auth errors:** Check `CORS_ORIGIN` includes exact Vercel URL; check `VITE_API_URL` (and legacy `VITE_API_BASE_URL` if present) on the frontend host.  
3. **Prisma `P2021` (table missing):** Deploy backend with `npm run start:prod` (or `npx prisma migrate deploy` before start) so migrations apply; avoid manual SQL unless documented (see `docs/deployment-production.md`).  
4. **Paystack webhook duplicates:** Same `providerRef` should be ignored after first success (see `markSubscriptionPaid` idempotency in `paymentService`).

---

## Phase 6.1 — Sync contract & API envelope (completion checklist)

Track these when closing Phase 6.1 (sync hardening).

| Done | Item |
|------|------|
| [x] | Sync contract defined (ADR 003) |
| [x] | Idempotency enforced at DB + API |
| [x] | Response format standardized (`sendOk` / `sendError` envelopes) |
| [x] | Sync logs added (`SYNC_*` events on transactions) |
| [x] | Duplicate request tested (manual or integration) |

**Evidence:** `docs/adr/003-sync-contract.md`, `backend/src/utils/sendOk.js`, `backend/src/utils/sendError.js`, `backend/src/controllers/transactionController.js`, integration tests under `backend/test/`.

---

## Revision

| Date | Change |
|------|--------|
| 2026-04-05 | Initial MVP RACI + checklist |
| 2026-04-05 | Phase 2: CI uses `migrate deploy`; runbook + deploy doc aligned with `VITE_API_URL` / `start:prod` |
| 2026-04-05 | Phase 3.1: `prisma validate` in CI, Node engines + `.nvmrc`, `deployment-phase-3.1.md` |
| 2026-04-07 | Phase 6.1: sync contract checklist + standardized API response helpers |
