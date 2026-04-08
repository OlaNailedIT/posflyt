# ADR 004 — Conflict Resolution Strategy

## Status

Accepted

## Context

POSflyt supports offline-first edits:

- products (price, stock)
- customers
- transactions

Conflicts occur when:

- same record updated in multiple places
- stale client overwrites newer server data

## Decision

### Transactions

- Immutable after creation
- No conflict resolution needed

### Products / Customers

We use:

**Last Write Wins (LWW) with timestamp**

Each record includes:

- updatedAt (server authoritative)

Client must send:

- lastKnownUpdatedAt

### Conflict rule

If:

incoming.lastKnownUpdatedAt < current.updatedAt

Then:

→ REJECT update  
→ return conflict response

Else:

→ APPLY update  
→ update updatedAt

### Conflict response

```json
{
  "status": "error",
  "code": "CONFLICT",
  "message": "Record has been updated by another source",
  "data": {
    "serverUpdatedAt": "...",
    "clientUpdatedAt": "...",
    "recordId": "..."
  }
}
```

## Consequences

- No silent overwrites
- Client can resolve conflicts explicitly
- Data integrity guaranteed
