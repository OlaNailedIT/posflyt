# Phase 4.2 — Offline capability & sync readiness

## Client storage

| Layer | Use |
|--------|-----|
| **IndexedDB** (`posflyt-offline-db`) | Product list cache, dashboard stats cache, customer list cache, transaction queue, generic **outbox** for API mutations while offline. |
| **localStorage** | Auth tokens and UI preferences (existing stores). |

IndexedDB schema version **2** adds `customers_cache` and `outbox`. Older stores (`products`, `dashboard`, `transactions_queue`) are unchanged.

## Outbox pattern

- **Sales** continue to use `transactions_queue` rows (POST `/transactions` payload, idempotent `client_transaction_id`).
- **Other mutations** use `outbox` with `kind`: `POST_PRODUCT`, `PUT_PRODUCT`, `POST_CUSTOMER`, each with a `body` and optional `meta` (e.g. `productId` for updates).
- **Replay order**: transaction rows and outbox rows are merged and processed **FIFO** by `createdAt`.
- **Retries**: failed rows use exponential backoff + jitter (same policy as the transaction queue).
- **IDs**: New products and customers created offline use **`crypto.randomUUID()`**, aligned with the backend’s optional `id` on create for products and customers.

## UI behavior

- **POS / Inventory**: Primary flows work offline using cached data and local queues; checkout also falls back to the transaction queue if the device appears online but the request fails with a **network-level** error.
- **Reports / CSV export**: Require connectivity; a clear message is shown when offline (non-critical degradation).

## Future sync engine (not implemented here)

### Conflict resolution (conceptual)

| Domain | Suggested direction |
|--------|---------------------|
| **Sales** | Server is authoritative; duplicate client ids are detected (`duplicate` / idempotency). Inventory conflicts return a typed error and stay in the queue for user action. |
| **Products / customers** | Prefer **last-write-wins** per record for MVP; escalate to field-level merge or server-wins if the API gains version vectors. |

### Background Sync API

The [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Sync_API) can wake a service worker to flush work when connectivity returns, even if the tab is closed. It is **not wired** in this phase (would require an `injectManifest` service worker and coordinated replay). The current **online event + interval** retry in `useOfflineSync` is the supported path.
