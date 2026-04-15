# Deployment runbook — Neon + Render + Vercel

Explicit sequence for **Neon (Postgres)**, **Render (backend API)**, and **Vercel (frontend)**. This does **not** auto-deploy anything; it is a checklist.

**Also read:** [`deployment-production.md`](./deployment-production.md), [`PRODUCTION_GO_NO_GO.md`](./PRODUCTION_GO_NO_GO.md), [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md), [`DRIFT_MONITORING.md`](./DRIFT_MONITORING.md), [`backend/docs/DEPLOYMENT_ENVIRONMENT_RULES.md`](../backend/docs/DEPLOYMENT_ENVIRONMENT_RULES.md).

---

## 1. Cursor Agent prompt (copy into Cursor)

Use this to keep automation aligned with repo rules:

```text
You are operating inside a production-grade monorepo (backend + frontend + prisma + CI/CD).

Your task is to guide and execute a SAFE deployment preparation for:
- Neon (Postgres)
- Render (Backend API)
- Vercel (Frontend)

You MUST strictly follow existing repo rules:
- PRODUCTION_GO_NO_GO.md
- INCIDENT_PLAYBOOK.md
- DRIFT_MONITORING.md
- ci.yml
- deploy-production.yml
- prisma-safety-check.js
- predeploy-check.js

DO NOT modify architecture or business logic unless explicitly instructed.

---

TASK FLOW:

1. VALIDATION PHASE
- Run and confirm locally (or via scripts only):
  - From backend/: npm run predeploy (runs predeploy-check = prisma validate)
  - From backend/: node scripts/prisma-safety-check.js prisma validate
  - From repo root: npm run test
  - From repo root: npm run build
- Confirm no failing checks

2. PRISMA + DATABASE SAFETY CHECK
- Verify schema.prisma matches committed migrations
- Ensure no drift between schema, prisma/migrations/, and _prisma_migrations (see Prisma production troubleshooting if mismatch)
- Confirm no unsafe operations (migrate reset, db push to prod)

3. ENVIRONMENT READINESS CHECK
- Validate required production env vars exist:
  DATABASE_URL, JWT_SECRET, NODE_ENV=production, CORS_ORIGIN, APP_BASE_URL
- Flag missing or unsafe defaults

4. BUILD READINESS
- Confirm frontend build succeeds
- Confirm backend npm run start:prod exists and matches host configuration

5. DEPLOYMENT READINESS REPORT
Output ONLY:
- PASS / FAIL
- Blockers (if any)
- Exact fix steps per blocker
- Whether safe to proceed to Neon / Render / Vercel configuration

DO NOT deploy automatically.
DO NOT assume missing values.
DO NOT change production logic.
```

**Note:** `prisma-safety-check.js` requires a subcommand (e.g. `prisma validate`). Running `node scripts/prisma-safety-check.js` with **no** arguments exits with an error.

---

## Phase 0 — Local safety (before any cloud change)

### Step 1 — Backend predeploy (schema validate)

```bash
cd backend
npm run predeploy
```

If this fails → **STOP**.

### Step 2 — Prisma safety wrapper + validate

```bash
cd backend
node scripts/prisma-safety-check.js prisma validate
npx prisma validate
```

(`predeploy` already validates; this double-checks via the same guard used before migrate.)

If either fails → **STOP**.

### Step 3 — Tests

From **repository root**:

```bash
npm run test
```

(Optional) `npm run test:integration` from root delegates to backend integration tests.

If tests fail → **STOP**.

### Step 4 — Frontend build

From **repository root**:

```bash
npm run build
```

If build fails → **STOP**.

---

## Phase 1 — Neon (database)

### Step 5 — Neon project

- Create or select a **production** database in Neon.
- Copy the **pooled** connection string if you use PgBouncer; add TLS/query params per Neon docs.
- **Never** commit `DATABASE_URL` to git.

### Step 6 — Apply migrations (from a trusted machine with prod `DATABASE_URL`)

**Only** forward migrations — never `migrate reset` on production.

From `backend/`:

```bash
# Preferred: guarded deploy (same family as start:prod migrate step)
npm run prisma:deploy
```

Or equivalently:

```bash
node scripts/prisma-safety-check.js prisma migrate deploy
```

Plain `npx prisma migrate deploy` also applies SQL, but the repo standard is the **guarded** command above.

### Step 7 — Migration status

```bash
cd backend
npx prisma migrate status
```

Expect database schema to match migration history (wording depends on Prisma version). If not, see [Prisma production troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting) and [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md) (migration failure).

---

## Phase 2 — Render (backend)

### Step 8 — Environment variables

Set in Render (or your secrets store):

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `JWT_SECRET` | Yes (production) |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Yes — exact SPA origins, comma-separated |
| `APP_BASE_URL` | Yes — public frontend URL |

Optional: `SENTRY_DSN`, `REDIS_URL`, `TRUST_PROXY=1` behind Render’s proxy, billing keys, etc. See [`deployment-production.md`](./deployment-production.md).

### Step 9 — Start command

From the **`backend`** directory on the service:

```bash
npm run start:prod
```

**Do not** use `npm start` alone in production — it does **not** run `prisma migrate deploy`. See `backend/README.md`.

### Step 10 — Health

Open:

```text
https://<your-render-service>/health
```

Expect **200** and `database: connected`. **503** means DB or startup failure — see [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md).

---

## Phase 3 — Vercel (frontend)

### Step 11 — Environment variables

At minimum:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend origin, e.g. `https://your-api.onrender.com` (no trailing slash) |

Align with [`deployment-production.md`](./deployment-production.md) (`VITE_API_BASE_URL` legacy name if present — keep consistent).

### Step 12 — Deploy

Trigger deploy from your normal flow (git push to connected branch or manual deploy).

### Step 13 — Smoke test in browser

- Login
- One authenticated API path (e.g. products or dashboard)
- One write path (e.g. sale) in **staging** first if available, then production when ready

---

## Phase 4 — Post-deploy validation

### Step 14 — Drift monitor (recommended)

From `backend/` with production `DATABASE_URL` (or staging first):

```bash
npm run drift:monitor
```

Exit code **0** expected. See [`DRIFT_MONITORING.md`](./DRIFT_MONITORING.md).

### Step 15 — Manual smoke

- Login, one transaction, dashboard loads — match [`PRODUCTION_GO_NO_GO.md`](./PRODUCTION_GO_NO_GO.md) §3.

---

## If something fails

Use [`INCIDENT_PLAYBOOK.md`](./INCIDENT_PLAYBOOK.md):

- Migration errors → containment and Prisma docs  
- Auth/CORS → JWT + `CORS_ORIGIN` + `APP_BASE_URL`  
- Webhooks → billing secrets and signature flags  
- Drift monitor failing → pause promotion, investigate integrity/sync  

---

## GitHub production promotion (optional)

If you use **Deploy Production** workflow: green **CI** on the commit, **tag** the commit, then `workflow_dispatch`. See [`backend/docs/CI_CD_PIPELINE.md`](../backend/docs/CI_CD_PIPELINE.md).

---

## What you need now

**Execution discipline**, not new architecture: run phases in order, stop on first failure, and record evidence in [`PRODUCTION_GO_NO_GO.md`](./PRODUCTION_GO_NO_GO.md).
