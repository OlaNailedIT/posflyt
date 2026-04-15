# Drift monitoring — post-deploy correctness

This layer answers: **“Is production slowly becoming wrong after a good deploy?”**

It complements:

- [`PRODUCTION_GO_NO_GO.md`](./PRODUCTION_GO_NO_GO.md) — gates **before** release
- [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md) — response **when** something breaks
- **CI** — validates **artifacts**, not live drift

## What runs

| Signal | Source | Meaning |
|--------|--------|--------|
| **Financial integrity** | `npm run audit:integrity` (`backend/scripts/auditFinancialIntegrity.js`) | Line totals, payment splits, customer outstanding vs transactions |
| **Sync backlog** | `Transaction.syncStatus` counts | Growing PENDING/FAILED = queue or server stress |
| **Idempotency pressure** | `AuditLog` `SYNC_DUPLICATE_TRANSACTION`, `SYNC_RETRY_FAILED` (24h) | Retries and duplicate detection firing more than normal |
| **Webhook anomalies** | `BillingWebhookEvent` with `outcome=ERROR` (24h) | Billing pipeline errors (not necessarily duplicates — `@@unique(provider, dedupeKey)` already prevents double-ingest) |

## How to run

From `backend/`:

```bash
npm run drift:monitor
npm run drift:monitor -- --json
```

Requires `DATABASE_URL` (read-only usage). Run against **staging** first, then schedule **production** (cron, GitHub Actions `schedule`, or platform job).

## Thresholds (environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DRIFT_MAX_PENDING_SYNC` | 500 | Global PENDING transactions |
| `DRIFT_MAX_FAILED_SYNC` | 100 | Global FAILED transactions |
| `DRIFT_MAX_DUPLICATE_EVENTS_24H` | 50 | `SYNC_DUPLICATE_TRANSACTION` audit events in 24h |
| `DRIFT_MAX_SYNC_RETRY_FAILED_24H` | 30 | `SYNC_RETRY_FAILED` in 24h |
| `DRIFT_MAX_WEBHOOK_ERRORS_24H` | 20 | Billing webhook ERROR outcomes in 24h |
| `DRIFT_SKIP_INTEGRITY_AUDIT` | (unset) | Set to `true` only to skip the audit child process (not recommended) |

Tune defaults per tenant scale (small businesses → lower thresholds).

## Exit code

- **0** — all checks within thresholds and integrity audit passed
- **1** — drift detected or audit failed (use to **fail** a scheduled job or alert)

## Alerting

Wire stdout / exit code to:

- Slack / PagerDuty / email (host cron wrapper)
- Optional: small GitHub Actions `workflow_dispatch` + `schedule` job that runs `npm run drift:monitor` with production `DATABASE_URL` in **secrets** (only if your org allows DB access from Actions — many teams run the script **on the app host** or a bastion instead).

## What this does *not* do

- Replace **schema drift** checks (`prisma migrate diff`, `prisma:drift-check`) — keep those in CI or ops
- Replace **ledger projection** deep reconciliation — extend `audit:integrity` or admin observability when you need stricter ledger vs commerce parity
- **Per-tenant** slicing — v1 is global counts; add `--business-id` later if needed

## Related code

- `backend/scripts/drift-monitor.js` — entrypoint
- `backend/src/services/adminOpsService.js` — `getSyncSummary` (same concepts, per business, for APIs)
- `backend/src/controllers/observabilityController.js` — operational mode for admins
