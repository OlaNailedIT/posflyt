# Hotfix playbook (Phase 6.4)

When production misbehaves, **financial and ledger integrity** take priority over speed. This playbook keeps fixes **repeatable, reviewable, and forward-only**.

## Non-negotiables

| Do | Do not |
|----|--------|
| Reproduce or understand the failure (logs, IFETS / UFEC signals, health, DB errors). | Run `prisma db push` against production. |
| Fix in **code** and/or a **new Prisma migration** (forward roll). | Edit production data by hand except via **approved** one-off scripts under review (avoid ad-hoc SQL in psql). |
| Run `prisma migrate deploy` (via guarded scripts) after migrations are merged. | Run `prisma migrate reset` on production or shared staging that mirrors prod expectations. |
| Deploy the **fixed** backend build after CI/staging validation. | “Patch” the DB schema outside migration history. |

## Why we never “rollback migrations”

Applied migrations have already changed the database. **Reverting migration files or restoring an old dump** without a controlled plan can leave UFEC / ledger / idempotency state **undefined**. The safe default is:

1. **Keep the DB state** that migrations produced.
2. **Roll forward** with a corrective migration + code if something was wrong.
3. If only **application logic** was bad, **deploy a previous app version** (see rollback below) while the schema remains compatible (additive-first design).

## Hotfix flow (standard)

1. **Triage** — Confirm scope (read-only degradation vs data risk). If IFETS / reconciliation spikes or ledger anomalies: treat as **stop-ship** until understood.
2. **Local fix** — Branch from the release tag or `main` as per your process.
3. **Schema change** — If needed, add a **new** migration only (`prisma migrate dev` locally, then commit SQL). Prefer **additive** changes; destructive changes belong in a **later** “contract” release after dual-read/write (see `MIGRATION_COMPATIBILITY.md`).
4. **Validate** — `npm run prisma:validate`, `npm run predeploy` (backend), tests, staging `migrate deploy`.
5. **Deploy** — Production: `npm run start:prod` (or your host’s equivalent: predeploy → guarded `migrate deploy` → server). **Snapshot/backup** before major migrations (see below).
6. **Monitor** — Watch error rates, UFEC / reconciliation, and business metrics after deploy.

## When production code must roll back (no DB rollback)

- **Rollback = deploy the previous backend artifact** (container image, git SHA, platform release).
- This is safe only if **migrations added in the bad release are still additive** and the old code ignores new columns/tables. If the bad release already ran **breaking** migrations, rolling back **code alone** may not be safe — you need a **forward fix** or a carefully planned contract migration (rare; requires runbook and leadership sign-off).

## Emergency data repair

- **Avoid** manual `UPDATE`/`DELETE` in production unless documented, reviewed, and ideally rehearsed on a copy.
- Prefer: **idempotent** repair job or one-off script in repo, reviewed like code, with a clear audit trail.

## Related docs

- `MIGRATION_COMPATIBILITY.md` — expand/contract, additive-first.
- `STAGING_DEPLOYMENT_RULES.md` — validation before prod.
- `DEPLOYMENT_ENVIRONMENT_RULES.md` — Prisma commands and environment gates.
