# Phase 7 — Billing reliability & revenue visibility

This document describes **incremental** backend and UI changes that harden payments without replacing the existing MVP checkout redirect flow.

## Payment & webhooks

- **`PaymentHistory`** has a unique constraint on `(provider, providerRef)` so each checkout reference is stored once.
- **`BillingWebhookEvent`** records successful processing with `provider` + `dedupeKey` (use optional `eventId` from the webhook body when present, else `providerRef`). Duplicate deliveries hit unique constraint handling and do not double-apply subscription updates.
- **`finalizePaidCheckout`** loads the payment row from the database and uses its `businessId` and `plan`. Webhook handlers **no longer trust** `businessId` / `plan` from the JSON body for authorization (tamper resistance).
- **Webhook signature**: HMAC verification unchanged for `x-posflyt-signature`. In **production**, if a provider webhook secret is **not** configured, verification **fails** (no silent accept). Set `REQUIRE_BILLING_WEBHOOK_SIGNATURE=false` for local testing without secrets.
- **Audit**: successful activations log `BILLING_PAYMENT_SUCCEEDED` on `AuditLog`.
- **Client confirm** (`POST /billing/confirm`) still requires admin auth and matching `PaymentHistory` row; dedupe key uses `confirm:${providerRef}` so it does not collide with webhook dedupe keys.

## Trial and access

- **`BILLING_TRIAL_DAYS`** (default `0`): when set to e.g. `14`, **new** subscriptions created at registration get `trialEndsAt`. Existing rows with `null` trial remain **grandfathered** (full FREE access).
- **`isSubscriptionActive`**: FREE plan with past `trialEndsAt` is inactive.
- **`GET /dashboard-stats`** uses **`requireSubscriptionActive`** so inactive trials/subscriptions receive **403** `SUBSCRIPTION_EXPIRED`. Other routes (e.g. POS) are unchanged to avoid breaking day-to-day operations without an explicit product decision.

## Admin UI

- **`GET /admin/billing-overview`**: tenant admin summary — SaaS payment revenue (day / week / month from `PaymentHistory` PAID), sync conflict counts from `AuditLog`, recent payment rows. Shown on the **Billing** page for `ADMIN` users.

## Migrations

Apply with your normal deploy process:

`npm run prisma:deploy` (or `prisma migrate dev` locally).

## Future work (not in this slice)

- Native Stripe `Stripe-Signature` / Paystack `x-paystack-signature` parsing and provider SDKs.
- Email/Slack alerts, payment retry queues, and full BI (churn, LTV) pipelines.
- Conversion pixels and additional GA4 events — extend existing `AnalyticsProvider` / `TrackedLink` patterns.
