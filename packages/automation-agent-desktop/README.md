# Ivaan Ops DCR Agent (desktop)

Windows **tray app** for non-technical users. Wraps `@ivaan/automation-agent` with pairing UI and bundles Playwright Chromium in the installer.

Product scope: [docs/PRD-DCR-AGENT-DESKTOP.md](../../docs/PRD-DCR-AGENT-DESKTOP.md) Phase 1.

## Developer run (without installer)

From repo root:

```powershell
npm run automation-agent:install
npm run automation-agent:build
npm run automation-agent-desktop:install
npm run automation-agent-desktop:build
npm run automation-agent-desktop:start
```

Use `npm run automation-agent:playwright-chromium` from repo root if Chromium is missing locally.

## Build installer (Windows)

```powershell
npm run automation-agent:install
npm run automation-agent:build
npm run automation-agent:playwright-chromium
powershell -ExecutionPolicy Bypass -File scripts/stage-agent-playwright-browsers.ps1
npm run automation-agent-desktop:install
npm run automation-agent-desktop:build
npm run automation-agent-desktop:dist
```

Output: `packages/automation-agent-desktop/release/IvaanOpsDCRAgentSetup-0.1.0.exe`

CI: `.github/workflows/dcr-agent-desktop-release.yml` (manual dispatch or tag `dcr-agent-v*`).

## Cloud download URL

Set on the Ivaan Ops deployment (Vercel):

- `DCR_AGENT_RELEASE_VERSION`
- `DCR_AGENT_RELEASE_DOWNLOAD_URL` — HTTPS link to the `.exe` (e.g. GitHub Release asset)
- `DCR_AGENT_RELEASE_SHA256` — optional integrity check for support docs
- `DCR_AGENT_MIN_VERSION` — optional minimum agent version

Build-time default Ivaan Ops URL for the pairing form: `IVAAN_OPS_DEFAULT_URL` (set in CI to production).
