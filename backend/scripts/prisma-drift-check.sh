#!/usr/bin/env bash
# Compare committed migrations (applied to a shadow DB) with prisma/schema.prisma.
# Requires PostgreSQL client + empty shadow database; set SHADOW_DATABASE_URL.
# Exit: 0 in sync; 1 on failure; prisma --exit-code uses 2 when diff is non-empty.

set -euo pipefail

: "${SHADOW_DATABASE_URL:?SHADOW_DATABASE_URL is required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx prisma validate

set +e
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
code=$?
set -e

if [ "$code" -eq 2 ]; then
  echo "::error::Schema drift: prisma/schema.prisma does not match committed migrations under prisma/migrations."
  echo "Human-readable diff:"
  npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url "$SHADOW_DATABASE_URL"
  echo ""
  echo "SQL-shaped diff (for debugging):"
  npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url "$SHADOW_DATABASE_URL" \
    --script
  exit 1
fi

if [ "$code" -ne 0 ]; then
  echo "::error::prisma migrate diff failed with exit code $code"
  exit 1
fi

echo "OK: prisma/schema.prisma and prisma/migrations are in sync."
