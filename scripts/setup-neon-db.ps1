# Apply migrations to Neon using a connection string you paste at runtime.
# Use the DIRECT (non-pooler) URL from Neon Console -> Connect.

param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$env:DATABASE_URL = $DatabaseUrl

Write-Host "Running migrations against Neon..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Neon schema is up to date." -ForegroundColor Green
Write-Host "Optional one-time seed: `$env:DATABASE_URL='...'; npm run db:seed"
