# Compare committed migrations (applied to a shadow DB) with prisma/schema.prisma.
# Requires PostgreSQL + empty shadow database; set SHADOW_DATABASE_URL.
# DATABASE_URL must be set (or in backend/.env) for prisma validate.
# Exit: 0 in sync; 1 on failure; prisma --exit-code uses 2 when diff is non-empty.

$ErrorActionPreference = "Stop"
if (-not $env:SHADOW_DATABASE_URL) {
  Write-Error "SHADOW_DATABASE_URL is required (empty Postgres database for shadow apply)."
}
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

npx prisma validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx prisma migrate diff `
  --from-migrations prisma/migrations `
  --to-schema-datamodel prisma/schema.prisma `
  --shadow-database-url $env:SHADOW_DATABASE_URL `
  --exit-code
$code = $LASTEXITCODE

if ($code -eq 2) {
  Write-Host "::error::Schema drift: prisma/schema.prisma does not match committed migrations under prisma/migrations."
  Write-Host "Human-readable diff:"
  npx prisma migrate diff `
    --from-migrations prisma/migrations `
    --to-schema-datamodel prisma/schema.prisma `
    --shadow-database-url $env:SHADOW_DATABASE_URL
  Write-Host ""
  Write-Host "SQL-shaped diff (for debugging):"
  npx prisma migrate diff `
    --from-migrations prisma/migrations `
    --to-schema-datamodel prisma/schema.prisma `
    --shadow-database-url $env:SHADOW_DATABASE_URL `
    --script
  exit 1
}

if ($code -ne 0) {
  Write-Host "::error::prisma migrate diff failed with exit code $code"
  exit 1
}

Write-Host "OK: prisma/schema.prisma and prisma/migrations are in sync."
