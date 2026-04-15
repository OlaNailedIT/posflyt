# Production deployment — env, schema, observability

**Phase 3.1 (environment parity & migration automation):** see [`docs/deployment-phase-3.1.md`](./deployment-phase-3.1.md).

## Deploy order (recommended)

1. Merge schema changes via **Prisma Migrate** (`prisma migrate dev` locally, commit `backend/prisma/migrations/`).
2. Deploy backend with **`npm run start:prod`** in the backend directory (or equivalent: `npx prisma migrate deploy` then `node src/server.js`). **Do not use `npm start` in production** — `npm start` only runs the Node process and **does not** apply migrations; it is intended as a dev/local fallback when `start:prod` is not appropriate.
3. Migrations apply **pending** SQL only; they do **not** reset or drop the database.
4. Deploy frontend after API is healthy.

CI does **not** run migrations against production. CI applies the same migration files to a **throwaway Postgres** only to run tests.

## Environment variables (backend)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Neon pooled URL; add `?sslmode=require` and `pgbouncer=true&connection_limit=1` for Prisma + pooler. |
| `JWT_SECRET` | Yes | Strong random string; rotate if leaked. |
| `JWT_ISSUER` | Optional | Default `posflyt-api`; must match access JWT `iss` claim. |
| `JWT_AUDIENCE` | Optional | Default `posflyt-client`; must match access JWT `aud` claim. |
| `JWT_ACCESS_EXPIRES_IN` | Optional | Access JWT lifetime (default `1h`). Use refresh flow for longer sessions. |
| `JWT_REFRESH_TTL_MS` | Optional | Refresh token storage TTL in ms (default 30 days). |
| `PORT` | Usually set by host | Render sets automatically. |
| `CORS_ORIGIN` | Yes in prod | Comma-separated frontend origins, e.g. `https://your-app.vercel.app` — **avoid `*`** in production. |
| `APP_BASE_URL` | Yes | Public frontend URL (billing redirects). |
| `SENTRY_DSN` | Optional | Backend error tracking. |
| `SENTRY_RELEASE` | Optional | Git SHA or semver; must match uploaded source maps if used. |
| `PAYSTACK_SECRET_KEY` | If billing | |
| `PAYSTACK_WEBHOOK_SECRET` | If webhooks | Verify HMAC on webhook body. |
| `TRUST_PROXY` | Recommended behind LB | Set `1` (or hop count) when the API is behind a reverse proxy / load balancer so `express-rate-limit` and `req.ip` reflect the real client (`X-Forwarded-For`). Omit locally. |

**Consistency checklist:** `DATABASE_URL` and `JWT_SECRET` on the host must match what you expect (wrong URL → connection errors; wrong secret → invalid tokens after deploy). `CORS_ORIGIN` must list the **exact** browser origin of the SPA (scheme + host, no trailing path).

## Frontend (Vercel or similar)

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | Backend origin, e.g. `https://your-backend.onrender.com` (no trailing slash). This is the primary variable used by the app. |
| `VITE_API_BASE_URL` | Legacy name; prefer `VITE_API_URL` everywhere. If both are set, ensure they match. |
| `VITE_SENTRY_DSN` | Optional. |
| `VITE_SENTRY_RELEASE` | Same as backend release when debugging cross-stack. |

## Schema: Prisma Migrate vs `db push`

| Workflow | Use |
|----------|-----|
| **Production & CI** | `prisma migrate deploy` — applies committed migrations only. |
| **Local development** | `npm run prisma:migrate-dev` — `prisma migrate dev` (creates migration files and applies them). |
| **Prototyping only** | `npm run prisma:db-push-dev` — **`prisma db push`**, dev-only; does not produce migration history. Do not use against production. |

- The repo must contain `backend/prisma/migrations/` with the initial migration and any follow-ups.
- **Never** point production at a database you did not intentionally provision.
- **Do not** run `prisma migrate reset` in automation; it is destructive and should stay manual and explicit.

## Sentry releases

1. Set `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` to the same value per deploy (e.g. `posflyt@1.2.3` or git SHA).
2. Upload source maps for the frontend build if using Sentry for JS (Vercel plugin or Sentry CLI).
3. Confirm one test error appears grouped under that release.

## Health checks

- **`GET /health`** — Single canonical liveness route (defined in `app.js` before JSON/rate-limit middleware). **No auth.** On success: `{ "status": "ok", "data": { "service": "posflyt-backend", "database": "connected" } }`. On DB failure: HTTP **503**, `{ "status": "error", "data": { "service": "posflyt-backend", "database": "disconnected" } }`. Uses `SELECT 1` for the DB check.
- **`GET /system/health`** — Separate path (not a duplicate of `/health`); optional richer payload for ops. Also public in the current app; prefer **`GET /health`** for uptime monitors.

## Horizontal scaling (Phase 7.4)

- Run **multiple** backend instances with the **same** `DATABASE_URL`, `JWT_SECRET`, and CORS settings. Sessions are **not** stored in memory on the instance.
- Configure **`TRUST_PROXY=1`** (or the number of proxy layers) on each instance so per-IP rate limits and logging are correct behind Render, ALB, or similar.
- Point load balancer health checks at **`GET /health`**; use **503** responses as “unhealthy” for the pool.

## Neon / network

- Local dev may fail to reach Neon **direct** (`P1001`); use the **pooler** URL from the Neon console.
- Avoid ad-hoc `db push` against production; use `migrate deploy` as above.

## Disaster recovery and continuity (Phase 7.6)

- **RTO/RPO:** Define and approve targets per component; use the template in [`phase-7.6-disaster-recovery-bc.md`](./phase-7.6-disaster-recovery-bc.md).
- **Database:** Rely on **Neon** backups and PITR for authoritative recovery; validate with periodic restore drills to a non-production database.
- **Application JSON backups** (`backupService`, under `backups/`): supplementary; on ephemeral hosts treat as **non-durable** unless copied to object storage.
- **Failover signals:** `GET /health` (503 when DB down), alerts from Phase 7.5, provider status pages.

## Paystack webhooks (MVP)

- **Idempotency:** `markSubscriptionPaid` skips work if `PaymentHistory` is already `PAID` for the same `providerRef` + `provider` (safe retries).
- **Signature:** Current handlers use a custom `x-posflyt-signature` HMAC for development consistency. Production Paystack sends **`x-paystack-signature`**; align the verifier with [Paystack docs](https://paystack.com/docs/payments/webhooks) when you go live.
- Response body may include `duplicate: true` when the webhook was a no-op replay.
