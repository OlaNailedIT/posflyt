# Phase 7.1 — Monetization test checklist (real-world simulation)

Use **test keys** and a **staging** webhook URL. Log correlation: search Pino for `event` = `payment_created`, `webhook_received`, `reconciliation_applied`, `payment_retry_attempt`, `payment_final_state`.

---

## TEST GROUP 1 — Happy path (baseline)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin opens Billing, selects plan + Stripe or Paystack, starts checkout | `PaymentHistory` row: `status=pending`, unique `idempotencyKey`, `providerMetadata` populated when keys exist |
| 2 | Complete payment on hosted page (test card success) | Redirect to `/billing/return?...` |
| 3 | Webhook delivers to `/api/payments/webhook/{stripe\|paystack}` | Logs: `webhook_received` / verified |
| 4 | Inspect DB or GET `/billing/payment-history` | `pending` → `paid`; subscription `ACTIVE`, plan + `expiresAt` set |
| 5 | Duplicate check | Single row per `provider`+`providerRef`; `BillingWebhookEvent` one row per gateway event id |

---

## TEST GROUP 2 — Webhook failure (critical recovery)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start checkout and **pay successfully** on provider while webhook URL is wrong, tunnel down, or endpoint returns 5xx | Provider shows **paid**; internal row may stay **`pending`** until webhook succeeds |
| 2 | Restore connectivity OR use recovery | **Option A:** Stripe dashboard → Webhooks → **Resend** event (same `event.id` → idempotent). **Option B:** `POST /admin/payments/reconcile/apply` (Bearer admin JWT) — server calls Stripe session retrieve / Paystack verify and **finalize** only if provider confirms paid |
| 3 | Confirm | `paid` + subscription active; logs `reconciliation_applied` if apply path used |

**Pass criteria:** No revenue without a path to consistency: webhook replay **or** provider-verified apply (not client-trusted alone).

---

## TEST GROUP 3 — Duplicate webhook (idempotency)

| Step | Action | Expected |
|------|--------|----------|
| 1 | After a successful payment, **replay** the same webhook (Stripe resend, Paystack replay, or copy raw body + signature) | HTTP 200; response `duplicate: true` where implemented; **no** second `paid` row mutation; subscription unchanged |
| 2 | DB | `BillingWebhookEvent` unique on `(provider, dedupeKey)` — second insert skipped |

---

## TEST GROUP 4 — Payment failure + retry

| Step | Action | Expected |
|------|--------|----------|
| 1 | Use Stripe decline test card or Paystack failure scenario | Webhook failure path → `status=failed` (subscription **unchanged** if previously active) |
| 2 | Wait for worker **or** `POST /admin/payment-retries/run` **or** server `setInterval` (when queue/redis disabled) | Logs `payment_retry_attempt`; `retryCount` increases; off-session charge **only** if PM/auth stored from prior success |
| 3 | Max failures | `status=canceled` after `PAYMENT_RETRY_MAX_ATTEMPTS`; Slack if configured |

**Note:** Retries that open **new** hosted sessions require the user to pay again; automated success requires saved Stripe PM or Paystack authorization from an earlier **paid** charge.

---

## TEST GROUP 5 — Idempotency under stress

| Step | Action | Expected |
|------|--------|----------|
| 1 | Double-click “Select plan” or replay `POST /billing/checkout-session` with same `x-request-id` (client stores correlation) | Second call returns **same** pending intent / URL (`duplicateSession` behavior) — **one** pending row per session key |
| 2 | Rapid parallel checkout **without** same `clientRequestId` | Multiple intents possible (by design); each has unique `idempotencyKey` and provider reference |

---

## TEST GROUP 6 — Backend restart mid-payment

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start checkout; **restart API** before webhook | Webhook POST is **stateless**; provider retries; on delivery, processing succeeds. If webhook was lost, use **Group 2** apply or dashboard resend |

---

## TEST GROUP 7 — Retry worker failure

| Step | Action | Expected |
|------|--------|----------|
| 1 | `QUEUE_ENABLED=true` + Redis: **stop** `npm run worker` | Failed payments **do not** advance via queue |
| 2 | With queue off / no Redis | API runs `payment-retry` on **setInterval** (~2m) — confirm logs or manual `POST /admin/payment-retries/run` |
| 3 | Restart worker | BullMQ job `payment-retry` resumes; Redis lock prevents concurrent duplicate workers |

---

## TEST GROUP 8 — Subscription consistency

| Step | Action | Expected |
|------|--------|----------|
| 1 | Business has **active** paid subscription | Baseline |
| 2 | Trigger **failed** renewal (new failed `PaymentHistory` or failed webhook) | Failed row does **not** set subscription to `CANCELED` or strip access **before** `expiresAt` / grace rules in `subscriptionService` |
| 3 | Only **successful** finalize updates plan + `expiresAt` for that payment’s plan |

---

## TEST GROUP 9 — Reconciliation endpoint

| Call | Expected |
|------|----------|
| `GET /admin/payments/reconcile` | JSON: `discrepancies[]` (mismatches), `checkedAt`, `sampleSize` |
| `POST /admin/payments/reconcile/apply` | `applied[]`, `skipped[]`, `errors[]` — heals **pending** rows when provider API confirms success |

---

## TEST GROUP 10 — Security

| Check | Expected |
|-------|----------|
| **A.** POST webhook with **invalid** signature | `401` / `400` (Stripe constructEvent failure) |
| **B.** Billing routes without Bearer or with **expired** JWT | `401` (`TOKEN_EXPIRED` / `INVALID_TOKEN`) |
| **C.** Replay **same** signed webhook payload | Second request idempotent (`duplicate: true` / ledger skip) |

---

## Final pass criteria (all must be true)

- [ ] No duplicate **finalize** for the same gateway event id (`BillingWebhookEvent`).
- [ ] Pending payments either receive webhooks, **stale** transition (`failed` after 48h pending), or **apply** after provider verify.
- [ ] Retry engine performs **real** provider calls (off-session or new session); not infinite (`MAX_RETRIES`).
- [ ] Subscription state matches successful payments; failures do not corrupt a valid subscription.
- [ ] API restart does not require in-memory payment state for webhook handling.
