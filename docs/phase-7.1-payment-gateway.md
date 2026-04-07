# Phase 7.1 — Payment gateway (server & client)

## Security & configuration

- **Never commit** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYSTACK_SECRET_KEY`, or `PAYSTACK_WEBHOOK_SECRET`. Keep them only in environment variables or a secrets manager.
- **`BILLING_MODE`**: `sandbox` (default) or `live`. Logged on webhook handling; use `live` only when keys and URLs point to production gateways.
- **HTTPS**: Terminate TLS at your host (Vercel, Render, nginx). The API must be reachable over HTTPS for production webhooks.

## Webhook URLs

| Provider | Route | Notes |
|----------|--------|--------|
| Stripe (official signature) | `POST /api/payments/webhook/stripe` | **Raw** JSON body; requires `Stripe-Signature` and `STRIPE_WEBHOOK_SECRET`. |
| Stripe / Paystack (custom HMAC) | `POST /billing/webhooks/stripe` or `paystack` | JSON body + `x-posflyt-signature` (legacy / tests). |
| Paystack | `POST /api/payments/webhook/paystack` | Same handler as legacy path; JSON body. |

Configure Stripe **metadata** on Checkout Session / PaymentIntent: `providerRef` and optionally `payment_ref` (must match `PaymentHistory.providerRef` created at checkout).

## Idempotency

- **`BillingWebhookEvent`** stores `(provider, dedupeKey)` uniquely. **Dedupe key** = Stripe event `id` when using `/api/payments/webhook/stripe`, or `eventId` / `providerRef` in custom payloads.
- **Processing order**: claim gateway event row first in the DB transaction, then mark payment `PAID` and upsert subscription (duplicate deliveries hit unique constraint and are skipped).

## Payment rows

- **`clientRequestId`**: API `x-request-id` when the checkout session was created (returned to the client as `requestId` for support correlation).
- **`gatewayEventId`**, **`retryCount`**, **`nextRetryAt`**, **`failureReason`**: reserved for retries and gateway reconciliation. Automated charge retries require gateway API integration (placeholder worker logs due rows).

## Admin

- `GET /admin/billing-webhook-events` — recent processed gateway events for the tenant.
- `GET /admin/payments-query?q=&status=` — filter/search payments.
- `POST /admin/payment-retries/run` — scans due rows (logs only until gateway retries are implemented).

## Slack alerts (optional)

- `SLACK_BILLING_WEBHOOK_URL` — used by `paymentRetryService` for permanent failure notifications when wired.

## Frontend

- Checkout response includes **`requestId`**; the billing page stores it in `sessionStorage` for correlation with support.
- **PCI**: never collect raw card numbers in the app; use Stripe Elements / Paystack Inline when you replace the redirect MVP.

## Client SDKs (next step)

- Install `@stripe/stripe-js` and/or Paystack’s client SDK when you add embedded payment UI; tokenize on the gateway side only.
