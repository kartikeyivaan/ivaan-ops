# Creates the local Postgres database and applies migrations + seed.
# Prerequisites: PostgreSQL installed, password set in .env DATABASE_URL.

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
  )

  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }

  return $null
}

$psql = Find-Psql
if (-not $psql) {
  Write-Host "psql not found. Install PostgreSQL 17+ and reopen PowerShell." -ForegroundColor Red
  Write-Host "  winget install PostgreSQL.PostgreSQL.17"
  exit 1
}

if (-not (Test-Path ".env")) {
  Write-Host ".env missing. Run: Copy-Item .env.example .env" -ForegroundColor Red
  exit 1
}

$databaseUrl = (Get-Content ".env" | Where-Object { $_ -match '^\s*DATABASE_URL=' -and $_ -notmatch '^\s*#' }) -replace '^\s*DATABASE_URL=\s*"?', '' -replace '"?\s*$', ''
if (-not $databaseUrl -or $databaseUrl -match "YOUR_LOCAL_PASSWORD|user:password@host") {
  Write-Host "Set a real DATABASE_URL in .env before running this script." -ForegroundColor Red
  exit 1
}

Write-Host "Creating database ivaan_ops (if needed)..."
$check = & $psql $databaseUrl -c "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
  $adminUrl = $databaseUrl -replace "/ivaan_ops(\?.*)?$", "/postgres`$1"
  & $psql $adminUrl -c "CREATE DATABASE ivaan_ops;"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not create database. Check postgres password in .env." -ForegroundColor Red
    exit 1
  }
}

Write-Host "Running migrations..."
npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Seeding data..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Local database ready. Start the app with: npm run dev" -ForegroundColor Green
