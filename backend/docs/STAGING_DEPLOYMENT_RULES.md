# Staging deployment rules (Phase 6.3)

Staging is the **only** environment used to **validate** that committed Prisma migrations apply cleanly before production. It is not a second development sandbox for ad‑hoc schema experiments.

## Responsibilities

| Rule | Detail |
|------|--------|
| **Validation only** | Run `prisma migrate deploy` (via `scripts/prisma-safety-check.js`) against a database that mirrors **production’s migration history and expectations**. Do not use `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` on staging unless you intentionally align with policy (`MIGRATION_ENV` / `NODE_ENV` — see `scripts/prisma-env-policy.js`). |
| **Schema parity** | Staging schema should track **the same** `prisma/migrations` chain as production. Drift here blocks safe promotion. |
| **Data seeding** | No automatic seeding on deploy unless explicitly enabled for that environment (e.g. a dedicated seed job or flag). Treat staging data as disposable but not as a substitute for migration correctness. |
| **Promotion gate** | If `migrate deploy` fails in CI or on the staging host, **do not** promote the release to production until migrations are fixed and re‑validated. |

## Promotion flow

1. **Development** — `prisma migrate dev` creates migration SQL; commit `prisma/migrations/`.
2. **Staging / CI** — `prisma migrate deploy` only (staging tier in `prisma-env-policy.js`).
3. **Production** — `prisma migrate deploy` only, after staging (and backups / review as per your runbook).

See also `DEPLOYMENT_ENVIRONMENT_RULES.md` (Prisma scripts and environment variables), `MIGRATION_COMPATIBILITY.md` (additive-first migrations), `HOTFIX_PLAYBOOK.md` (production fixes), and **`CI_CD_PIPELINE.md`** (GitHub Actions + staging/prod hooks).
