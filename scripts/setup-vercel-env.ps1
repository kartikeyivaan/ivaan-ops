# Push environment variables from .env.vercel to the linked Vercel project.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-vercel-env.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$envFile = Join-Path $repoRoot ".env.vercel"
if (-not (Test-Path $envFile)) {
  Write-Host "Missing .env.vercel. Copy .env.example, fill in Neon + auth values, save as .env.vercel." -ForegroundColor Red
  exit 1
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim().Trim('"')
  if ($name -and $value) {
    $vars[$name] = $value
  }
}

if (-not $vars.ContainsKey("DATABASE_URL")) {
  Write-Host ".env.vercel must include DATABASE_URL (Neon pooled connection string)." -ForegroundColor Red
  exit 1
}

if (-not $vars.ContainsKey("DIRECT_URL")) {
  $vars["DIRECT_URL"] = $vars["DATABASE_URL"] -replace "-pooler\.", "."
}

if (-not $vars.ContainsKey("AUTH_SECRET") -or $vars["AUTH_SECRET"] -match "replace-with") {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $vars["AUTH_SECRET"] = [Convert]::ToBase64String($bytes)
  Write-Host "Generated a new AUTH_SECRET for Vercel." -ForegroundColor Yellow
}

$required = @("DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "APP_URL", "AUTH_URL")
foreach ($name in $required) {
  if (-not $vars.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($vars[$name])) {
    Write-Host "Missing required value in .env.vercel: $name" -ForegroundColor Red
    exit 1
  }
}

if (-not (Test-Path ".vercel/project.json")) {
  Write-Host "Linking to Vercel project ivaan-ops..." -ForegroundColor Cyan
  npx vercel link --yes --project ivaan-ops
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$targets = @("production", "preview", "development")
foreach ($target in $targets) {
  foreach ($name in $required) {
    Write-Host "Setting $name ($target)..." -ForegroundColor Cyan
    $vars[$name] | npx vercel env add $name $target --force
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

Write-Host "`nEnvironment variables synced to Vercel." -ForegroundColor Green
Write-Host "Redeploy from the Vercel dashboard or run: npx vercel --prod"
