# Deployment & environment rules (Phase 5)

This document defines **how** we configure databases, secrets, and Prisma for **development**, **staging**, and **production**. It does **not** change application or UFEC logic—only operational rules.

---

## 1. No secrets in the repository

- Never commit real `DATABASE_URL`, `JWT_SECRET`, API keys, or webhook secrets.
- Use **placeholders** in `.env.example`, `.env.development`, and `.env.production` templates.
- Local secrets live in `**backend/.env`** (gitignored via `**/.env`).
- Production/staging: inject via your platform (**Render**, **Fly.io**, **AWS Secrets Manager**, **GitHub Actions secrets**, etc.).

---

## 2. Environment ↔ database mapping


| Environment     | Database expectation                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| **development** | Local PostgreSQL (or Docker); dedicated DB user per developer machine is fine. |
| **staging**     | Isolated cloud DB; **different** credentials and DB name from production.      |
| **production**  | Managed PostgreSQL (TLS, backups, restricted network); **unique** credentials. |


**Rule:** Staging and production must **never** share the same `DATABASE_URL`.

---

## 3. `DATABASE_URL` and rotation

- Store credentials with **least privilege** (app role: `CREATE` only where migrations run from CI, or split migration user vs runtime user if your org requires it).
- **Rotate** database passwords on a defined schedule (e.g. quarterly) or after any suspected leak.
- After rotation, update the secret in the host environment and redeploy; **no** schema or UFEC code changes are required.

---

## 4. `SHADOW_DATABASE_URL` (Prisma)

- Points to an **empty** database used for:
  - `prisma migrate dev` (shadow database for migration planning)
  - `prisma migrate diff --from-migrations ...` (when a shadow URL is required)
  - Drift-check scripts (`prisma:drift-check` in `package.json`) where applicable
- **Must** be different from `DATABASE_URL` (name and/or credentials).
- **CI / staging:** Provide `SHADOW_DATABASE_URL` for jobs that run `migrate diff` or `migrate dev`-style checks.
- `**prisma migrate deploy` (production apply)** does **not** use the shadow database; production pipelines should still use **only** `migrate deploy`, not `migrate dev`.

---

## 5. Migration safety


| Context          | Allowed command                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Local dev**    | `prisma migrate dev` (optional), `prisma migrate deploy` against local DB                    |
| **CI / staging** | `prisma migrate deploy` to apply pending migrations; use shadow only for **diff/drift** jobs |
| **Production**   | `**prisma migrate deploy` only** — never `migrate dev`                                       |


**UFEC / ledger / idempotency:** Environment and migration workflow changes **must not** modify UFEC engine code or business rules. If a migration is needed, it follows the normal Prisma migration process and code review.

---

## 6. Prisma Client generation

- Run `npx prisma generate` after dependency install or schema changes (CI: part of build).
- On Windows, if `EPERM` occurs on the query engine binary, stop Node processes holding the file, then regenerate (see project troubleshooting notes).

---

## 7. Frontend (Vite) environment

- Root `.env` / `.env.development` / `.env.production` templates hold `**VITE_`*** variables only (no server secrets).
- `VITE_API_URL` must point to the correct API base for each environment.

---

## 8. Checklist before production go-live

- Production `DATABASE_URL` and `JWT_SECRET` are only in secret storage.
- Staging uses separate DB and secrets from production.
- `SHADOW_DATABASE_URL` set wherever drift/migrate-dev tooling runs.
- Deploy pipeline uses `prisma migrate deploy` (not `migrate dev`).
- TLS enabled for production Postgres (`sslmode=require` or provider default).

---

## 9. References

- [Prisma: Production troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting)
- [Prisma: Deploy migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)
- Backend templates: `backend/.env.example`, `backend/.env.development`, `backend/.env.production`
- CI template (non-production): `backend/.env.ci.example`

---

## 10. `DATABASE_URL` rotation procedure

1. **Provision** a new database user/password (or new password) in Postgres with the same privileges as the current app role.
2. **Update** `DATABASE_URL` in your secret store (not in git); deploy to staging first if you use a staged rollout.
3. **Restart** all API processes so the new connection string is loaded.
4. **Validate:** `npx prisma db execute --stdin` with `SELECT 1` or run health checks; run smoke tests.
5. **Revoke** the old password or drop the old user after traffic is stable on the new credential.
6. **Never** point the shadow database at production data — use a separate empty DB for `SHADOW_DATABASE_URL`.

---

## 11. `JWT_SECRET` rotation procedure

1. **Generate** a new secret (≥64 hex chars recommended; use `crypto.randomBytes` or `openssl rand -hex 48`).
2. **Deploy** the new `JWT_SECRET` to the backend environment (secret manager / host).
3. **Restart** the API — existing access tokens **invalidate** (users must refresh or re-login depending on your refresh flow).
4. **Plan** downtime or communication if you must rotate during active sessions.
5. **Never** reuse the same `JWT_SECRET` across development, staging, and production.

---

## 12. CI/CD safety (no production secrets in pipelines)


| Rule                             | Detail                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **CI database**                  | Ephemeral Postgres (e.g. GitHub Actions `services`); credentials in workflow `env` only, **not** production. |
| **Template file**                | `backend/.env.ci.example` documents local parity; real CI uses workflow-injected variables.                  |
| **Allowed**                      | `migrate deploy`, `prisma validate`, `prisma generate`, tests.                                               |
| **Forbidden in CI / production** | `prisma migrate reset`, `db push` against production, `DROP DATABASE` in pipelines.                          |


**Production deploy:** inject `DATABASE_URL` + `JWT_SECRET` from the host secret store only.

---

## 13. Prisma connection configuration (codebase)

- `backend/prisma/schema.prisma` uses `url = env("DATABASE_URL")` only — **no** hardcoded connection strings in the schema.
- Application code must not embed Postgres URLs; use `process.env` / `config` loaded from environment.

---

## 14. Forbidden commands (production & CI)


| Command                       | Why                                                 |
| ----------------------------- | --------------------------------------------------- |
| `prisma migrate reset`        | Destroys data; **dev-only** with explicit approval. |
| `prisma db push` (production) | Bypasses migration history; use dev-only scripts.   |


---

## 15. UFEC stability

- Secret rotation and credential changes **do not** change UFEC engine code, ledger, or idempotency semantics.
- If you change `JWT_SECRET`, only **session/token** behavior changes until clients re-authenticate.

---

## 16. Phase 6 — Prisma deployment guardrails (scripts)


| Script / entry                                     | Behavior                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run prisma:migrate` / `npm run prisma:deploy` | Runs `scripts/prisma-safety-check.js` then `prisma migrate deploy`. **Production tier** (`MIGRATION_ENV=production` or `NODE_ENV=production`): blocks `migrate reset` and `db push` via policy; host guard also blocks those on `VERCEL`/`RENDER`; logs a **production migration** warning before `migrate deploy`. |
| `npm run prisma:reset`                             | Guarded `migrate reset` — policy allows only in **development** tier.                                                                                                                                                                                                                                               |
| `npm run prisma:db-push-dev`                       | Guarded `db push` — allowed only when policy allows **dev**-style actions (development tier).                                                                                                                                                                                                                       |
| `npm run prisma:migrate-dev`                       | Guarded `prisma migrate dev` — allowed only in **development** tier (`scripts/prisma-env-policy.js`).                                                                                                                                                                                                               |
| `npm run predeploy`                                | Phase 6.4 — runs `scripts/predeploy-check.js` (`prisma validate` only; no DB connection).                                                                                                                                                                                                                           |
| `npm run start:prod`                               | `predeploy` → guarded `migrate deploy` → `node src/server.js`.                                                                                                                                                                                                                                                      |
| `node scripts/ci-env-guard.js`                     | If `CI=true` **and** `NODE_ENV=production`, exits with error unless `ALLOW_MIGRATE=true` (prevents misconfigured pipelines).                                                                                                                                                                                        |


Environment policy lives in `scripts/prisma-env-policy.js` (consumed by `prisma-safety-check.js`). Set `**MIGRATION_ENV=staging`** (or `NODE_ENV=test` with `CI=true`) so CI migration steps use the **staging** tier (deploy-only validation). GitHub Actions sets `MIGRATION_ENV=staging` and runs `ci-env-guard.js` before `migrate deploy`.

---

## 17. Phase 6.3 — Staging vs production promotion

- **Staging rules:** see `**STAGING_DEPLOYMENT_RULES.md`** (validation-only role, schema parity with production, migration failures block promotion).
- **Forbidden in production:** `prisma migrate dev`, `prisma db push`, `prisma migrate reset` — enforced by policy + production-like host checks, not by convention alone.

---

## 18. Phase 6.4 — Production release, rollback, and hotfixes

- **Additive-first migrations & expand/contract:** `**MIGRATION_COMPATIBILITY.md`** — all changes should stay backward compatible for at least one release; **never** depend on “rolling back” applied migrations; **roll forward** with new migrations.
- **Hotfix process:** `**HOTFIX_PLAYBOOK.md`** — no `db push` / manual schema hacks in prod; fix locally → new migration → `migrate deploy`.
- **App rollback:** Redeploy the **previous backend build** if needed; DB stays on applied migrations (design migrations so old code still works or you have a forward fix).
- **Pre-deploy:** Run `**npm run predeploy`** (or rely on `**npm run start:prod`**, which runs it before migrate). In CI, `prisma validate` already runs; optional: call `predeploy` in pipelines for parity with production start.
- **Backups:** Take a DB snapshot / `pg_dump` before **major** or risky migrations (provider UI or `pg_dump` — see Postgres docs).
- **During rollout:** Watch IFETS / UFEC / reconciliation signals; if anomalies **spike**, stop the rollout and triage before continuing.

---

## 19. Phase 6.5 — CI/CD pipeline (automation + promotion)

- **Full blueprint:** `**CI_CD_PIPELINE.md`** — commit → CI → staging deploy → manual production deploy; GitHub Environments, secrets, and workflow file map.
- **Workflows:** `.github/workflows/ci.yml`, `deploy.yml` (CI/CD Pipeline — staging), `deploy-production.yml` — staging runs after green CI on `main`; production is `**workflow_dispatch`** with environment protection.
- **Promotion rule:** Migrations are **validated in CI** and applied on **staging** before you trigger **production**; hooks should run `**npm run start:prod`** (or equivalent) so predeploy + migrate deploy stay ordered.