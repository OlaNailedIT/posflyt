# ADR 003 — Sync Contract (Transactions)

## Status

Accepted

## Context

POSflyt supports offline-first transaction creation.
Clients may retry requests due to:

- network failures
- app reloads
- background sync retries

This creates risk of:

- duplicate transactions
- partial failures
- inconsistent UI state

## Decision

We define a strict sync contract for transaction submission.

### Endpoint

POST /transactions

### Request

Each transaction MUST include:

- client_transaction_id (string, UUID)
- business_id (from auth)
- payload (items, totals, etc.)

### Idempotency Rule

- `client_transaction_id` is UNIQUE per business
- If a request is repeated:
  → return existing transaction
  → DO NOT create a new one

### Response Format

Success:

```json
{
  "status": "ok",
  "data": {
    "transactionId": "uuid",
    "clientTransactionId": "uuid",
    "syncStatus": "applied"
  }
}
```

Duplicate:

```json
{
  "status": "ok",
  "data": {
    "transactionId": "uuid",
    "clientTransactionId": "uuid",
    "syncStatus": "duplicate"
  }
}
```

Failure:

```json
{
  "status": "error",
  "code": "SYNC_FAILED",
  "message": "Reason",
  "data": {
    "clientTransactionId": "uuid"
  }
}
```

## Consequences

- Client can safely retry requests
- Server guarantees no duplicates
- Sync becomes deterministic and testable
