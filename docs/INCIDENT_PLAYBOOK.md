# POSflyt — Incident Playbook

This playbook pairs with [`PRODUCTION_GO_NO_GO.md`](./PRODUCTION_GO_NO_GO.md). Each scenario lists **detection**, **containment**, **recovery**, and **do not** actions.

**Principle:** Prefer **data correctness** over keeping traffic flowing. When in doubt, **degrade gracefully** and **stop writes** rather than double-apply money or stock.

---

## How to use this document

| Column | Meaning |
|--------|---------|
| **Maps to gate** | Which Go/No-Go section is implicated |
| **Detection** | Signals (metrics, logs, HTTP, DB) |
| **Containment** | Stop bleeding in minutes |
| **Recovery** | Safe path back to steady state |
| **Do NOT** | Actions that worsen data loss or ambiguity |

---

## 1. Prisma migration failure (deploy-time or post-deploy)

**Maps to gate:** §2 Migration safety, §9 Deployment.

### Detection

- `npm run start:prod` fails during `prisma migrate deploy` (see `backend/package.json`).
- Host logs show Prisma `P3009`, `P3018`, or migration SQL errors.
- App starts but **first query** throws “column does not exist” / Prisma `P2022`.
- `_prisma_migrations` shows **FAILED** or missing entries vs repo `backend/prisma/migrations/`.

### Containment

1. **Freeze deploys** — do not re-run production hook until cause is known.
2. If the API is **partially up** with schema mismatch: scale to **zero** or point LB away until consistent (avoid split-brain writes).
3. Capture: exact migration name, error text, and DB role used.

### Recovery

1. Follow [Prisma production troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting) — **after backup**.
2. If migration failed mid-way: resolve failed state per Prisma docs (`migrate resolve`), **never** guess.
3. If history mismatch only: use team-approved baseline / `migrate resolve` procedure (see `backend/prisma/migrations/README.md`).
4. Re-run **`prisma migrate deploy`** in **staging** first, then production with same artifact.

### Do NOT

- Run `prisma migrate reset` on production or shared staging with real data.
- Apply “quick” manual DDL in prod without a migration file and review.
- Delete rows from `_prisma_migrations` without a runbook and backup.

---

## 2. Payment duplication / webhook storm (billing)

**Maps to gate:** §5 Webhook safety, §4 Financial integrity.

### Detection

- Spike in `POST` to Paystack/Stripe webhook paths (`billingController` webhook handlers).
- Duplicate `PaymentHistory` rows or duplicate `PAID` for same `providerRef` (check admin billing / DB).
- Alerts from `SLACK_BILLING_WEBHOOK_URL` or payment retry worker (`paymentRetryService`).
- `GET /admin/billing-webhook-events` (admin) shows abnormal volume (see `backend/src/routes/adminRoutes.js`).

### Containment

1. Enable **`REQUIRE_BILLING_WEBHOOK_SIGNATURE=true`** in production if not already (`backend/src/config/env.js`).
2. If provider is flooding: temporarily **return 200** only after idempotent no-op (avoid infinite retries) — coordinate with provider docs; do not disable verification.
3. Pause **automated retries** that could amplify (review `paymentRetryService` / queue workers if enabled).

### Recovery

1. Verify idempotent path: same `providerRef` + provider should not double-apply (see `docs/deployment-production.md` Paystack notes).
2. Reconcile subscriptions vs payments; issue **manual adjustment** in a tracked process if duplicates occurred.
3. Add or verify **deduplication** in DB layer (future hardening) per product backlog.

### Do NOT

- Turn off signature verification to “stop the noise.”
- Delete payment rows without finance-approved reconciliation.

---

## 3. Idempotency violation (duplicate transactions / double stock)

**Maps to gate:** §4 Financial integrity.

### Detection

- Same client request id / idempotency key processed twice (logs, duplicate `Transaction` or lines).
- Integration tests failing on retry paths; sudden **inventory** divergence vs sales.
- UFEC / integrity anomalies increasing (admin observability endpoints, `observabilityService`).

### Containment

1. Reduce **concurrency** on POS write path if possible (feature flag / rate limit on create-transaction).
2. Flag business for **manual freeze** on high-value SKUs if numbers diverge.

### Recovery

1. Identify scope: time window, `businessId`, device id.
2. Run reconciliation / return flows per domain rules; use `return.integration.test.js` scenarios as reference for expected behavior.
3. Add or tighten **DB unique constraints** on idempotency fingerprint (engineering follow-up).

### Do NOT

- “Fix” duplicates by editing rows in SQL without audit trail.
- Rely on application-only checks under race without DB guarantees long term.

---

## 4. Ledger mismatch / financial drift

**Maps to gate:** §4 Financial integrity, §7 Observability.

### Detection

- Admin observability shows rising anomalies (`observabilityController` / UFEC health style payloads).
- `integrityIngest` or ledger projection checks fail in tests or audits (`npm run audit:integrity` in `backend/package.json`).
- Daily totals vs sum of transactions diverge for a business day.

### Containment

1. Treat as **severity 1** — notify owner; reduce optional batch jobs if they write ledger-related data.
2. Snapshot **exports** (reports) and mark “do not use for compliance” until reconciled.

### Recovery

1. Run **`audit:integrity`** and **`npm run drift:monitor`** (see [`DRIFT_MONITORING.md`](./DRIFT_MONITORING.md)) against staging first; then scoped production checks with read-only access.
2. Trace ingest pipeline: client → API → `FinancialLedgerEntry` / integrity events per schema.
3. Fix root cause in code + migration if schema gap; re-run projection jobs if applicable.

### Do NOT

- Backfill numbers in production without replayable events.
- Run chaos or destructive tests during investigation (`CHAOS_ENGINE_*` must stay off — see §10 Go/No-Go).

---

## 5. API / health endpoint failure

**Maps to gate:** §3 API health, §7 Observability.

### Detection

- `GET /health` returns **503** or non-JSON error (`backend/src/app.js` — canonical liveness).
- Load balancer marks instances unhealthy.
- `database: disconnected` in `/health` body per `docs/deployment-production.md`.

### Containment

1. Confirm **Postgres** reachable: credentials, pooler URL, TLS (`DATABASE_URL`).
2. Roll back **app** to last known-good deploy (`.github/workflows/deploy-production.yml` **rollback** + `target_release`) — **not** DB rollback by default.
3. If DB is down: fail closed; do not serve stale writes.

### Recovery

1. Restore DB from provider backup (Neon PITR, etc.) only via approved DR process (`docs/deployment-production.md` §Disaster recovery).
2. Redeploy app after DB is healthy; verify `/health` then smoke tests (Go/No-Go §3).

### Do NOT

- Point production at a restored DB without understanding migration history alignment.
- Silence health checks to green while DB is broken.

---

## 6. Sync backlog explosion (offline queue)

**Maps to gate:** §6 Offline / sync.

### Detection

- Rising **PENDING** / **FAILED** transaction sync counts (admin ops / observability summaries).
- Client UFEC / sync banners show persistent failure; user reports “sales stuck.”
- Growth in retry metrics over 24h (`getSyncSummary`-style data).

### Containment

1. Identify: **network**, **auth expiry**, or **server 5xx** from sync path.
2. Communicate: “sales may be delayed; do not delete local data on devices.”

### Recovery

1. Fix server root cause (auth, validation, rate limits).
2. Allow **ordered replay** after fix; monitor for duplicates (pairs with §3).
3. Use staging to replay a captured queue pattern before mass production retry.

### Do NOT

- Clear IndexedDB / local queue on devices without backup — risk of data loss.
- Force duplicate submits from clients to “flush” backlog without idempotency checks.

---

## 7. Auth / JWT failure or suspected compromise

**Maps to gate:** §8 Security.

### Detection

- Mass **401** on API; refresh flow failing.
- `JWT_SECRET` rotation without coordinated deploy (all sessions invalid — expected once).
- Suspected leak: unexpected admin actions in audit logs.

### Containment

1. Rotate **`JWT_SECRET`** in secrets store; redeploy all API instances with same value.
2. If compromise: invalidate **refresh tokens** at DB layer (`RefreshToken` model) per security runbook; force re-login.
3. Review **CORS** and **APP_BASE_URL** — no accidental wildcard.

### Recovery

1. Confirm `NODE_ENV=production` and env.js **rejects** empty JWT secret.
2. Re-run smoke: login, protected route, write (Go/No-Go §3).

### Do NOT

- Commit secrets to git or share in chat.
- Disable auth middleware “temporarily.”

---

## 8. Chaos engine misconfiguration (production)

**Maps to gate:** §10 Chaos system.

### Detection

- Unexpected latency / fault injection in prod logs.
- `CHAOS_ENGINE_ENABLED` or `CHAOS_ENGINE_ALLOW_PRODUCTION` set in host env (`backend/src/config/env.js`).

### Containment

1. **Unset** or set to `false` both chaos flags; redeploy immediately.
2. Confirm routes under chaos namespace are unreachable or no-op in prod.

### Recovery

1. Re-run Go/No-Go §10 checklist.
2. Restrict chaos to **staging** only in docs and env templates.

### Do NOT

- Enable chaos in production without explicit written approval and window.

---

## Quick reference — files and commands

| Topic | Location |
|-------|-----------|
| Go/No-Go checklist | `docs/PRODUCTION_GO_NO_GO.md` |
| Production deploy order | `docs/deployment-production.md` |
| CI/CD flow | `backend/docs/CI_CD_PIPELINE.md` |
| Env rules | `backend/docs/DEPLOYMENT_ENVIRONMENT_RULES.md` |
| Prisma migrate / baseline notes | `backend/prisma/migrations/README.md` |
| Start command | `backend/package.json` → `start:prod`, `predeploy` |
| Production workflow | `.github/workflows/deploy-production.yml` |
| Billing webhooks | `backend/src/controllers/billingController.js` |
| Chaos flags | `CHAOS_ENGINE_ENABLED`, `CHAOS_ENGINE_ALLOW_PRODUCTION` in `backend/src/config/env.js` |

---

## Escalation

- **Data or money ambiguity:** stop automated remediation; involve owner + finance.
- **Schema / migration:** involve DBA or platform owner; backup before any resolve.

Last updated: aligns with **v1.0-rc.0** release candidate process.
