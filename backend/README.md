# POSflyt Backend

Express + Prisma + PostgreSQL backend for POSflyt SaaS POS/ERP.

## Setup

1. Copy env file:
   - `cp .env.example .env` (or create `.env` manually on Windows)
2. Update `DATABASE_URL` and `JWT_SECRET`
3. Install deps:
   - `npm install`
4. Generate Prisma client and create/apply migrations (preferred workflow):
   - `npm run prisma:generate`
   - `npm run prisma:migrate` (creates migration files under `prisma/migrations/` — commit them)
5. Start server:
   - **`npm run dev`** — local development (nodemon).
   - **`npm start`** — runs `node src/server.js` **only** (no `migrate deploy`). Use as a quick local fallback when the DB is already migrated; **do not use this as the production start command** (migrations would not run).
   - **`npm run start:prod`** — **required for production**: runs `prisma migrate deploy` then starts the server (applies pending migrations; does not reset data).

Configure your host (e.g. Render) **Start Command** to `npm run start:prod` (from the `backend` directory), not `npm start`.

**JWT:** Access tokens are signed with `JWT_SECRET` and include `iss` / `aud` (see `JWT_ISSUER`, `JWT_AUDIENCE`). Default access lifetime is `JWT_ACCESS_EXPIRES_IN` (e.g. `1h`); long-lived sessions use **refresh tokens** (`POST /auth/refresh`) stored hashed in the database.

**Dev-only shortcut:** `npm run prisma:db-push-dev` runs `prisma db push` for quick prototyping. Do not use it for production schema changes; use Migrate instead.

**Never** automate `prisma migrate reset` — it wipes data and should only be run manually when you intend to destroy local data.

**CI & parity:** `npm run prisma:validate` checks `schema.prisma`. Use **Node 20** (see repo root `.nvmrc` and `engines`). Full deployment/migration checklist: `docs/deployment-phase-3.1.md`.

## API routes

- `GET /health` — Public liveness (no JWT); use for load balancers.
- `POST /auth/register`
- `POST /auth/login`
- `GET /products`
- `POST /products`
- `PUT /products/:id`
- `POST /transactions`
- `GET /transactions`
- `GET /dashboard-stats`

Protected routes require: `Authorization: Bearer <jwt>`.
