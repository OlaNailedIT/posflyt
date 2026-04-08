# ADR 001: Sync idempotency and duplicate transactions

## Status

Accepted (MVP)

## Context

POSflyt supports offline sales. The same client transaction may be submitted more than once due to retries, flaky networks, or user actions.

## Decision

1. **Primary idempotency key:** `client_transaction_id` (UUID), generated on the client **before** persisting offline or sending online.  
2. **Server behavior:** `Transaction.id` in PostgreSQL equals `client_transaction_id`. If a row with that id already exists for the business, the server returns **duplicate** status and **does not** apply stock or line items again.  
3. **Ordering:** Bulk processing sorts by `created_at` then `client_transaction_id` for deterministic replay.  
4. **Conflicts:** Inventory conflicts (e.g. insufficient stock) return a dedicated error code; data is not silently dropped.

## Consequences

- Retries are safe for the same UUID.  
- Clients must never reuse a UUID for a different sale.  
- **Future:** optional `Idempotency-Key` header on HTTP layer can mirror the same UUID for API v1 without changing the domain model.

## Links

- `backend/src/services/transactionService.js` — `processSingleTransaction`, duplicate branch.
