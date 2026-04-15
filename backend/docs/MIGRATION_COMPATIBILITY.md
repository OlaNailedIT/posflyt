# Migration compatibility & release strategy (Phase 6.4)

All **new** migrations in `prisma/migrations/` must stay **backward compatible with the previous backend release** for at least **one deployment cycle**, unless a named exception is approved (e.g. internal-only service, maintenance window).

This enables **safe deploys** and **application rollback** without reverting the database.

## Core rule

> Schema changes must be **additive-first** so an older app version can still run against the new DB (or coexist during rolling deploys).

## Prefer (expand phase)

- `ADD TABLE`, `ADD COLUMN` (nullable or with safe defaults)
- `ADD INDEX` (prefer `CONCURRENTLY` in raw SQL when required for large tables — follow Postgres docs)
- New enum values added in a way old code tolerates (often: add value first, deploy code, then remove old paths later)

## Defer (contract phase — later release)

- `DROP COLUMN`, `DROP TABLE`
- `RENAME COLUMN` / `RENAME TABLE` without a transition period (prefer: add new column → backfill → switch code → drop old column later)
- Narrowing `ENUM`, type changes that reject existing rows

## Two-phase model (expand → contract)

| Phase | Purpose |
|-------|---------|
| **A — Expand** | Add new tables/columns; keep old fields and code paths working. |
| **B — Contract** | Remove deprecated columns after all readers/writers are updated and data is migrated. |

### Example (rename concept)

**Avoid** renaming in one step:

```sql
-- Bad for zero-downtime: breaks old app
ALTER TABLE "Sale" RENAME COLUMN "total" TO "totalAmount";
```

**Prefer:**

1. Migration 1: `ADD COLUMN "totalAmount"`; backfill from `total`; deploy code that writes both.
2. Migration 2 (later release): drop `total` after code no longer reads it.

## Financial data

UFEC / ledger / transaction tables are **especially** sensitive: additive-only changes reduce the risk of **inconsistent** totals, duplicate application of migrations, or partial deploys.

## Review checklist (PR)

- [ ] Migration is **forward-only** (new revision file committed; no editing applied migrations in prod).
- [ ] Changes are **additive** or clearly justified contract-phase work with a runbook.
- [ ] Staging / CI **`migrate deploy`** succeeded.
- [ ] No reliance on **`db push`** for the change.

## If something went wrong

See **`HOTFIX_PLAYBOOK.md`** — fix forward with new migrations + code; do not “undo” applied migrations casually.
