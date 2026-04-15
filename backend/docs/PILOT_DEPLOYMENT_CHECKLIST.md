# Pilot deployment checklist (seal)

Use this before pointing production traffic at a new release.

## Full state alignment (Postgres + Prisma client)

After any `schema.prisma` or migration change, run these in `backend/` with no file locks and no Node process holding `node_modules/.prisma`:

1. `npx prisma generate` — regenerates `@prisma/client` from the current schema.
2. `npx prisma migrate deploy` — applies pending SQL migrations to the target database (use the same `DATABASE_URL` as production/staging).

Until both succeed, the API can return 500s (missing columns) or the client can disagree with the DB.

## Client offline DB (IndexedDB)

When you add or rename object stores in `src/services/db.js`, increment `OFFLINE_DB_VERSION` and extend the `upgrade` handler. The startup guard (`runIndexedDbVersionGuard`) compares the live DB version to that constant and runs the upgrade path before React mounts.

## Backend (Node)

- Set `NODE_ENV=production` on the host or process manager (not only in `.env` if the platform overrides it).
- Provide a single `DATABASE_URL` (or your host’s equivalent) to production Postgres; run pending Prisma migrations against that database before going live.
- Set JWT/session secrets and any billing keys from your provider; never commit real values.
- Confirm CORS / cookie settings match the production web origin (HTTPS).

## Frontend (Vite build)

- Set `VITE_API_URL` (or legacy `VITE_API_BASE_URL`) to the **HTTPS** production API origin (no trailing slash), e.g. `https://api.example.com`.
- Production builds default the API to `https://posflyt-backend.onrender.com` only when no env is set; override explicitly for your pilot domain.
- Optional: `VITE_SUPPORT_WHATSAPP_URL` — full `https://wa.me/...` link for the Help page “Contact support” button.
- Build with `npm run build` (or your CI script); serve static files over HTTPS.

## Smoke checks

- Sign in, open Dashboard (manager): Big Three loads; “View detailed analytics” reveals financial snapshot and Trust Center when expected.
- Cashier: complete a sale; manager: run daily close once per instructions on the page.
