# Phase 3 Step 1 — Global Idempotency Boundary (GIB)

## Rule

`global_event_id === clientEventId` for every `FinancialEvent`. This is the single execution identity across UI, queue, sync, UFEC router, and ledger shadow.

## Client implementation

- **Registry**: `src/financial/ufecIdempotencyRegistry.js` — statuses (`INITIATED`, `IN_FLIGHT`, `COMPLETED`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `RECONCILE_REQUIRED`), IndexedDB store `ufec_idempotency` (DB v10), in-memory cache.
- **Coalescing**: same-tab concurrent calls with the same `global_event_id` share one in-flight promise (`IN_FLIGHT_COALESCE` log in dev).
- **Cross-tab**: registry `IN_FLIGHT` blocks another tab until **stale** (`IN_FLIGHT_STALE_MS`, default 120s) or completion.
- **Retries**: recoverable failures increment `retryCount`; at `MAX_UFEC_FAILURE_RETRIES` (10) the state becomes `RECONCILE_REQUIRED`.
- **Sync**: `getSyncReplayIdempotencyDecision` skips replay when `COMPLETED` (use cached body), defers when `IN_FLIGHT`, or fails on `blocked_reconcile`.

## Debugging

- `VITE_UFEC_IDEMPOTENCY_DEBUG=1` — verbose idempotency logs.

## Tests

Inject `skipIdempotency: true` into `executeFinancialEvent(event, deps)` when testing HTTP/enforcement in isolation.
