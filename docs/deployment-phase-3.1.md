# Phase 3.1 — Environment parity & migration automation

This document defines how POSflyt keeps **one schema source of truth**, **automated `migrate deploy`**, **consistent** dev/staging/prod practices, and **CI enforcement** against schema drift (Phase 3.2).

## 1. Migration tool: Prisma Migrate

- **Source of truth:** `backend/prisma/schema.prisma` plus versioned SQL under `backend/prisma/migrations/`.
- **Apply in production:** `npm run start:prod` in the `backend` directory runs `prisma migrate deploy` **before** `node src/server.js`. Pending migrations apply once; already-applied migrations are **skipped** (tracked in `_prisma_migrations`).
- **Idempotency:** Re-running `migrate deploy` is safe: Prisma records applied migration names and does not re-execute them.
- **Do not** use `prisma db push` for production (dev-only script: `npm run prisma:db-push-dev`).

## 2. CI/CD integration

| Stage | Behavior |
|--------|----------|
| **GitHub Actions CI** | **Prisma drift check** job (see §2.1) runs first. Then `npm ci`, `prisma validate`, `prisma generate` + `prisma migrate deploy` on **ephemeral Postgres 16** (same migration files as prod). Does **not** connect to staging/production DBs. |
| **Host deploy (e.g. Render)** | Set **Start Command** to `npm run start:prod` (from `backend`) so each release applies migrations before serving traffic. |
| **Vercel (frontend)** | No DB migrations; ensure `VITE_API_URL` matches the API that ran `migrate deploy`. |

**Schema validation in CI:** `npx prisma validate` runs on every backend-related CI job so invalid `schema.prisma` fails before tests.

### 2.1 Phase 3.2 — Shadow database & `prisma migrate diff` (no drift)

CI provisions a **second** database on the same ephemeral Postgres service (`shadow_posflyt`) and runs:

```bash
cd backend
# Use CI-style credentials only on an ephemeral/local Postgres — never production.
export SHADOW_DATABASE_URL="postgresql://<USER>:<PASSWORD>@localhost:5432/<SHADOW_DB_NAME>?schema=public"
npm run prisma:drift-check
```

Under the hood this runs `backend/scripts/prisma-drift-check.sh`, which:

1. Runs `prisma validate`.
2. Runs `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`.

Prisma uses the shadow database internally to **apply migrations** and compare the resulting schema to **`schema.prisma`**. If they differ, the pipeline **fails** so deployments never proceed with a mismatched model vs. migration history.

**Exit codes with `--exit-code`:** `0` = no drift; `2` = non-empty diff (treated as failure; logs include human-readable and `--script` SQL output); `1` = error (connection, invalid args, etc.).

**Policy:** All DDL must come from editing `schema.prisma` and generating migrations (`prisma migrate dev` / committed SQL under `prisma/migrations/`). **Do not** apply hand-written `ALTER TABLE` / `CREATE` in any environment without a matching migration in the repo—CI is designed to catch drift before merge.

## 3. Rollback strategy

| Failure | Suggested response |
|---------|---------------------|
| **Bad deploy / bad app code** | Roll back the **application** to the previous image/release (e.g. Render rollback, `deploy-production.yml` rollback hook). The DB schema may already have applied a new migration. |
| **Bad migration** | **Do not** delete rows from `_prisma_migrations` by hand without a DBA plan. Prefer a **forward-fix** migration that corrects the schema. Rolling **back** SQL is a manual, reviewed process (restore from backup + controlled migration), not automated here. |
| **Emergency** | Restore Postgres from snapshot / PITR, then align migration history with reality only with explicit runbook steps. |

Automated `migrate deploy` is additive and transactional per migration file; destructive changes should be reviewed in PR like any other code.

## 4. Environment parity

| Area | Standard |
|------|-----------|
| **Node.js** | **20.x** — see root `.nvmrc` and `engines` in root and `backend/package.json`. CI uses `node-version: 20`. |
| **Dependencies** | Lockfiles: root `package-lock.json`, `backend/package-lock.json`. Use `npm ci` in CI and production builds, not `npm install`. |
| **PostgreSQL** | CI uses **Postgres 16** (`postgres:16`). Match staging/production major version where possible to avoid subtle SQL/operator differences. |
| **Env vars** | Local: copy `backend/.env.example` → `.env` (never commit secrets). Staging/prod: host secret store (Render env, Vercel env, etc.). Same **names** across environments; values differ per environment. |

**Configuration as code:** GitHub workflows and this repo document the process; full Terraform/CloudFormation is out of scope for this MVP but should mirror the same Node/Postgres major versions when introduced.

## 5. Preventing schema drift

1. **All** DDL flows through **Prisma Migrate** (`migrate dev` locally → commit `migrations/` → `migrate deploy` in CI and prod).
2. **No** manual `ALTER TABLE` in staging/production except emergency, documented, and followed by a matching migration in repo.
3. **`prisma validate`** in CI catches invalid schema definitions early.
4. **`prisma migrate diff` + shadow DB** in CI (§2.1) ensures `schema.prisma` and `prisma/migrations/` stay the **single source of truth**; the job fails if they diverge.

## 6. Checklist before merging schema changes

- [ ] `cd backend && npm run prisma:migrate` (or equivalent) generated new migration SQL.
- [ ] Migrations committed with the same PR as code that depends on them.
- [ ] CI green (includes **drift check** + `prisma validate` + `migrate deploy` on ephemeral DB).
- [ ] Production **Start Command** remains `npm run start:prod` (or explicit `migrate deploy` in release phase).

**If the drift job fails locally:** Ensure Postgres is running, create an empty database for the shadow URL, set `SHADOW_DATABASE_URL`, then run `npm run prisma:drift-check` from `backend`. Regenerate or fix migrations until the diff is empty.

See also: `docs/deployment-production.md`.
