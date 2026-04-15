<#
  One-command recovery: EPERM on query_engine, stale client, or DB drift after schema changes.

  Run from backend folder:
    npm run prisma:recovery
    npm run prisma:recovery -- -KillNode
    npm run prisma:recovery -- -SkipInstall

  Rules: stop npm run dev first, or use -KillNode (stops all node.exe — see script).
#>
param(
  [switch]$KillNode,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $BackendRoot

Write-Host ""
Write-Host "=== POSflyt Prisma recovery (backend: $BackendRoot) ===" -ForegroundColor Cyan
Write-Host ""

if ($KillNode) {
  Write-Host "[1/6] Stopping node.exe (all instances)..." -ForegroundColor Yellow
  taskkill /F /IM node.exe 2>$null | Out-Null
  Start-Sleep -Seconds 2
} else {
  Write-Host "[1/6] Skipping taskkill (stop 'npm run dev' manually, or re-run with -KillNode)" -ForegroundColor DarkGray
}

Write-Host "[2/6] Removing node_modules\.prisma (generated client cache)..."
Remove-Item -Recurse -Force (Join-Path $BackendRoot "node_modules\.prisma") -ErrorAction SilentlyContinue

if (-not $SkipInstall) {
  Write-Host "[3/6] npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "[3/6] Skipping npm install (-SkipInstall)"
}

Write-Host "[4/6] npx prisma generate..."
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[5/6] prisma migrate deploy (via prisma-safety-check)..."
node (Join-Path $BackendRoot "scripts\prisma-safety-check.js") prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[6/6] npx prisma validate..."
npx prisma validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Migration status:" -ForegroundColor Cyan
npx prisma migrate status

Write-Host ""
Write-Host "Done. Start API: npm run dev" -ForegroundColor Green
Write-Host "Optional DB UI: npx prisma studio" -ForegroundColor DarkGray
Write-Host ""
