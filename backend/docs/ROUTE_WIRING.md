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

## Controlled `/api` aliases (compatibility only)

We **do not** duplicate every router under `/api` (avoids silent drift). Aliases cover the main **legacy** surfaces that are hit when the client base URL wrongly includes `/api`:

| Alias mount | Legacy surface |
|-------------|----------------|
| `/api/auth` | Same as `/auth` |
| `/api/products` | Same as `/products` |
| `/api/inventory-count` | Same as `/inventory-count` |
| `/api/transactions` | Same as `/transactions` |
| `app.use("/api", customerRoutes)` | `/customers` |
| `app.use("/api", settingsRoutes)` | `/settings` |
| `app.use("/api", expenseRoutes)` | `/expenses`, `/expenses/meta` |
| `app.use("/api", dashboardRoutes)` | `/dashboard-stats`, `/analytics/daily-summary` |

**Not duplicated under `/api`:** admin, billing, reports, backup, staff, analytics, etc. Fix the client base URL or add a **narrow** alias only when a real caller requires it.

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
