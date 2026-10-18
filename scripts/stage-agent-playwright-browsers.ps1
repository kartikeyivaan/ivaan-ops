# Copies Playwright Chromium from the local cache into the agent package for installer bundling.
# Run after: npm run automation-agent:playwright-chromium (from repo root)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot "packages\automation-agent\playwright-browsers"
$src = Join-Path $env:LOCALAPPDATA "ms-playwright"

if (-not (Test-Path $src)) {
  throw "Playwright browser cache not found at $src. From repo root run: npm run automation-agent:playwright-chromium"
}

if (Test-Path $dest) {
  Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force

Write-Host "Staged Playwright browsers to $dest"
