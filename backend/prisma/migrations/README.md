# Prisma migrations — baseline strategy

## Active migrations

This folder contains **only** the canonical baseline:

| Folder | Purpose |
|--------|---------|
| `00000000000000_baseline/` | Full PostgreSQL DDL matching the current `schema.prisma` (enums, tables, FKs, indexes). |

`prisma migrate deploy` on an **empty** database applies this single migration and yields a schema aligned with Prisma.

## Historical migrations (archived)

All previous incremental migrations (`202604*`) are **preserved** (not deleted) under:

`../migrations_legacy/`

They remain in the repository for audit, diff, and incident review. They are **not** executed for new environments.

## Fresh database

```bash
cd backend
npx prisma migrate deploy
```

Then:

```bash
npx prisma generate
```

## Existing / production databases

If a database **already** has rows in `_prisma_migrations` for migrations that no longer exist in `prisma/migrations/`, Prisma will report a **migration history mismatch**. Resolve using [Prisma’s production troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting) (backup first). Typical approaches:

- If the **live schema already matches** `schema.prisma`: mark the baseline as applied with `prisma migrate resolve --applied 00000000000000_baseline` **only after** aligning `_prisma_migrations` with team/DBA process, **or**
- Reconcile migration history with a controlled baseline / squash procedure (never skip backups).

**Failed migrations** (e.g. `P3009`): fix or roll back the failed migration in `_prisma_migrations` per Prisma docs before new deploys.

## Drift checks

```bash
npx prisma validate
```

Compare database to schema (when a shadow DB URL is available):

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

## UFEC

No UFEC engine, ledger, or application logic lives in SQL here; this is **schema only**. Business rules stay in the application layer.
