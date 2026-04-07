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

### Disaster recovery (Phase 7.6)

For **RTO/RPO templates**, Neon restore expectations, multi-region notes, and **DR drill** cadence, see [`phase-7.6-disaster-recovery-bc.md`](./phase-7.6-disaster-recovery-bc.md).

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

### Phase 6.2 — Client sync state machine (checklist)

| Done | Item |
|------|------|
| [x] | Client sync state machine implemented |
| [x] | Failed transactions retryable |
| [x] | Sync UI indicators visible |
| [x] | Global sync indicator added |
| [ ] | Offline → online sync tested |

**Evidence:** `src/constants/syncStatus.js`, `src/services/db.js` (queue fields), `src/hooks/useOfflineSync.js`, `src/pages/PosPage.jsx`, `src/components/SyncStatusIndicator.jsx`.

**Note:** Keep the last row as manual/E2E proof when you have a repeatable test or runbook capture.

### Phase 6.3 — Sync performance (checklist)

| Done | Item |
|------|------|
| [x] | Batch sync implemented |
| [x] | Exponential backoff working |
| [x] | Retry prioritization working |
| [x] | No duplicate sync runs |
| [ ] | Queue drains fully under load |

**Evidence:** `src/hooks/useOfflineSync.js` (`BATCH_SIZE`, `CONCURRENCY`, `runSync`, `runWithLimit`), `src/services/db.js` (`getPendingQueuedTransactions`, `bumpTransactionRetryNow`, backoff on failure).

**Note:** “Queue drains fully under load” remains the stretch **load-test** criterion; mark when you have a scripted or manual evidence run.

### Phase 6.4 — Conflict resolution & data integrity (checklist)

| Done | Item |
|------|------|
| [x] | Conflict strategy defined (ADR 004) |
| [x] | `lastKnownUpdatedAt` enforced on product and customer updates |
| [x] | Conflict responses returned (`code: CONFLICT`, `data` with server/client timestamps) |
| [x] | UI handles conflict errors (refresh messaging + list invalidation) |
| [x] | Inventory protected from negative stock (`INSUFFICIENT_STOCK` on oversell) |

**Evidence:** `docs/adr/004-conflict-resolution.md`, `backend/src/services/productService.js`, `backend/src/services/customerService.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/services/transactionService.js`, `src/pages/InventoryPage.jsx`, `src/pages/CustomersPage.jsx`, `src/components/ConflictResolutionHost.jsx`, `src/components/ConflictResolutionModal.jsx`, `src/stores/conflictStore.js`.

---

## Revision

| Date | Change |
|------|--------|
| 2026-04-05 | Initial MVP RACI + checklist |
| 2026-04-05 | Phase 2: CI uses `migrate deploy`; runbook + deploy doc aligned with `VITE_API_URL` / `start:prod` |
| 2026-04-05 | Phase 3.1: `prisma validate` in CI, Node engines + `.nvmrc`, `deployment-phase-3.1.md` |
| 2026-04-07 | Phase 6.1: sync contract checklist + standardized API response helpers |
| 2026-04-07 | Phase 6.2: client sync state machine checklist (IndexedDB + POS + header indicator) |
| 2026-04-07 | Phase 6.3: batch sync + backoff + concurrency checklist |
| 2026-04-07 | Phase 7.6: DR/BC doc link in runbook |
| 2026-04-07 | Phase 6.2–6.4: checklist aligned with implemented code (6.2/6.3 E2E load items left open) |
