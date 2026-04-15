# Archived Prisma migrations (historical)

This directory holds the **previous incremental migration folders** (`202604*`) that were part of the active chain before the **baseline** migration (`00000000000000_baseline`) was introduced.

## Why they are here

- **Audit trail** — full history of schema evolution remains in git.
- **No execution** — new databases use only `prisma/migrations/00000000000000_baseline`.
- **UFEC** — neutralized / legacy SQL (e.g. NO-OP replacements) is preserved for review; canonical DDL is in the baseline file.

## Do not

- Copy these back into `prisma/migrations/` alongside the baseline without a **designed** reconciliation plan (duplicate DDL / ordering conflicts).
- Treat this folder as something `prisma migrate deploy` runs automatically — it does not.

## Reference

Operational notes: `../migrations/README.md`
