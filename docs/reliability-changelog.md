# POSflyt Reliability Changelog

Track all reliability and integrity changes here.

## 2026-04-01

- Enforced idempotent transaction handling with duplicate-safe behavior.
- Required `client_transaction_id` and `created_at` for transaction sync payloads.
- Added conflict codes for transaction sync outcomes.
- Hardened stock decrement with guarded DB update to prevent negative inventory.
- Added sync queue failure tracking (`pending/syncing/failed`, retry metadata).
- Added auto-retry with backoff and manual priority sync support.
- Added incremental inventory integrity monitor and mismatch audit logging.
- Added request ID propagation (`x-request-id`) for diagnostics.
- Standardized core auth and transaction error responses with structured shape.
- Added baseline reliability endpoint: `/system/reliability-summary` (admin).
- Added reconciliation run diagnostics in reliability summary:
  - last incremental run
  - last full run
  - reconciliation status/error
  - mismatch severity counts
- Added daily full stock reconciliation cycle while retaining 5-minute incremental checks.

## 2026-04-02

- Standardized remaining backend controllers to `sendOk`/`sendError` response contract.
- Normalized validation error code handling to `VALIDATION_FAILED` across touched controllers.
- Added real `averageSyncRetryResolutionTimeMs` metric via retry-failure/retry-resolution audit events.
- Added 7-day reconciliation trend in reliability summary (`warningCount`/`criticalCount` per day).
- Added failure cohorts to reliability summary (`byCode`, `byEndpoint`, `byBusiness`).
- Added Playwright smoke tests for:
  - admin staff flow
  - cashier staff-route denial
  - desktop/mobile nav behavior
  - core loop sanity + sync visibility
- Removed branch placeholder from active POS UX (branch references hidden until branch CRUD exists).
- Added minimal staff lifecycle safety controls:
  - disable staff (revoke sessions + block old password)
  - reactivate staff (admin-set new password)
- Added dashboard Trust Center with:
  - synced/pending/failed visibility
  - duplicate-prevented visibility
  - reconciliation status and confidence signal
  - one-click "Fix my sync" recovery actions
- Added daily close admin flow with checklist and confirmation logging.
- Added queue replay clarity in settings:
  - deterministic replay statement
  - last retry and next retry visibility
  - copyable sync summary for owner sharing
- Updated onboarding path to a 15-minute setup target:
  - add 3 products
  - complete first sale
  - review first-day summary
- Updated trust-first positioning copy to:
  "Never lose a sale. Never guess your stock. Even when internet fails."
