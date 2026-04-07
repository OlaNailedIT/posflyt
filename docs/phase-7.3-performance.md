# Phase 7.3 — Performance optimization

This phase improves **latency**, **bundle delivery**, and **operational visibility**. Hosting (Vercel, Render, Neon) already provides TLS, HTTP/2, and edge caching for static assets; this document focuses on what the codebase adds.

## 7.3.1 — Backend

| Control | Implementation |
|--------|------------------|
| **Indexes** | Prisma migration `20260409100000_phase_7_3_performance_indexes`: tenant-scoped indexes on `User`, `Store`, `Product`, `Customer`, `SmartAlert`, `PaymentHistory`, `BackupRecord`, `IssueReport`; composite `(businessId, createdAt DESC)` on `Transaction` and `AuditLog`; `TransactionItem` on `transactionId` / `productId`; `ActiveSession` on `userId`. |
| **Response compression** | `compression` middleware on the API (gzip/deflate for bodies &gt; ~1 KB). |
| **Slow requests** | Prometheus counter `posflyt_http_slow_requests_total` (duration ≥ 1s) and `httpSlowRequestsTotal` in JSON runtime metrics. |

**Not in scope here:** Redis response cache, materialized views, or background job queues—add when traffic and reporting patterns justify them.

## 7.3.2 — Frontend

| Control | Implementation |
|--------|------------------|
| **Route-level code splitting** | `React.lazy` + `Suspense` for all route pages in `src/App.jsx` (smaller initial JS). |
| **Vendor chunking** | `vite.config.js` `manualChunks`: react, react-query, router, zustand, axios, sentry, idb, and a shared `vendor` bucket. |
| **React Query** | Default `staleTime` increased to **45s** to cut duplicate refetches during navigation (`src/main.jsx`). |

**Optional next steps:** virtualize very long product/customer lists; `React.memo` on row components; responsive images (`srcset`) for marketing assets.

## 7.3.3 — Network and assets

| Control | Notes |
|--------|--------|
| **CDN** | Vercel (and similar) serves `dist/` from the edge; configure cache rules in the host dashboard. |
| **Compression** | Brotli/Gzip for static assets is typically enabled by the CDN; API gzip is handled by `compression` on the Node server. |
| **PWA** | Existing Workbox config (`vite-plugin-pwa`) continues to precache build assets; tune `runtimeCaching` in `vite.config.js` as APIs evolve. |

## 7.3.4 — Monitoring

| Control | Notes |
|--------|--------|
| **Metrics** | Use `GET /metrics` (Phase 7.1) + `posflyt_http_slow_requests_total` for SLO-style alerting. |
| **Budgets** | Define FCP/LCP/API p95 targets in your monitoring tool; optional Lighthouse CI can be added later. |
| **RUM** | Enable Sentry performance (`SENTRY_TRACES_SAMPLE_RATE`) or web-vitals in the SPA when ready. |

## Verification

1. Run `npx prisma migrate deploy` and confirm indexes exist (`\d+ "Product"` in `psql`).
2. `npm run build` — inspect `dist/assets` for split chunks (`vendor-react`, etc.).
3. Hit a JSON API with `Accept-Encoding: gzip` and confirm compressed response.
4. Scrape `/metrics` and confirm `posflyt_http_slow_requests_total` after a slow request (optional).
