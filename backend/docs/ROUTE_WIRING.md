# Route wiring (Express)

## Mounted route modules

All routers under `backend/src/routes/` are registered from `backend/src/app.js`.

| Prefix | Routers / notes |
|--------|------------------|
| `/auth` | `authRoutes` |
| `/products`, `/inventory-count`, `/transactions` | Dedicated mounts |
| `/` | `dashboardRoutes`, `systemRoutes`, `settingsRoutes`, `adminRoutes`, `customerRoutes`, `reportRoutes`, `exportRoutes`, `onboardingRoutes`, `analyticsRoutes`, `billingRoutes`, `auditRoutes`, `backupRoutes`, `sessionRoutes`, `supportRoutes`, `staffRoutes`, `usageRoutes`, `marketingRoutes`, `expenseRoutes` |
| `/api/admin` | `adminApiRoutes` |
| `/api/bi` | `biRoutes` |
| `/api/v1` | `eventRoutes`, `reconciliationRoutes`, `observabilityRoutes`, `streamRoutes`, `chaosRoutes`, `distributedRoutes` |
| (root) | Webhooks, public receipt, metrics — see `app.js` |

## Base URL vs path (`ROUTE_NOT_FOUND`)

The SPA uses **relative** paths like `/products`, `/auth/login`, and separately **`/api/v1/...`**, **`/api/admin/...`** for versioned/admin APIs.

- **Recommended:** `VITE_API_URL` = API origin **only**, e.g. `https://api.example.com` (no trailing `/api`).
- If `VITE_API_URL` is `https://api.example.com/api`, then `/products` becomes `https://api.example.com/api/products`. The server must expose that URL.

## API compatibility layer (`/api`)

When `VITE_API_URL` ends with `/api`, the SPA’s relative paths (e.g. `/admin/sales-feed`, `/audit-events/bulk`) must resolve under `/api/...`. The same router modules are mounted at `/` and again under `app.use("/api", …)` — **one handler**, two URL prefixes.

| Mount | Same routes as |
|-------|------------------|
| `/api/auth` (+ limiter) | `/auth` |
| `/api/products` | `/products` |
| `/api/inventory-count` | `/inventory-count` |
| `/api/transactions` | `/transactions` |
| `app.use("/api", …)` | `customerRoutes`, `settingsRoutes`, `expenseRoutes`, `dashboardRoutes`, `adminRoutes`, `reportRoutes`, `exportRoutes`, `onboardingRoutes`, `analyticsRoutes`, `billingRoutes`, `backupRoutes`, `sessionRoutes`, `supportRoutes`, `staffRoutes`, `usageRoutes`, `marketingRoutes`, `systemRoutes`, `auditRoutes` |

**Audit:** `POST /audit-events/bulk`, `GET /audit-logs` — work as `/…` and `/api/…`.

**Not duplicated under generic `/api`:** **`/api/v1/*`** (versioned), **`/api/admin`** (ops `adminApiRoutes`), **`/api/bi`** — those paths already carry their own prefix in `api.js`; mounting them again would double-prefix.

## Infrastructure aliases

These are separate from REST routers:

- `GET /api/health`, `GET /api/ready` — same as `/health`, `/ready`
- `POST /api/billing/webhooks/*` — same Stripe/Paystack handlers as other webhook paths
- `GET /api/receipts/public/:token` — public receipt
- Large JSON for `POST /api/backups/indexeddb` — same as `/backups/indexeddb`

## `ROUTE_NOT_FOUND`

Returned by `notFound` when no route matches. Typical causes: wrong **base URL**, typo, wrong method, or a path that is not in the controlled alias set — prefer fixing `VITE_API_URL` first.

## Versioned API

Paths under **`/api/v1/*`** already include the prefix in the request path; do **not** set `VITE_API_URL` to `…/api` or you will get **`/api/api/v1/...`** (wrong).
