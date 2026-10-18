# Ivaan Ops Automation Agent

Local Windows agent for DCR portal browser automation. Uses Playwright with **separate Chrome profiles** per portal (PCMV / ISE).

## Repository

This is **not** a separate Git repo. It lives inside the **Ivaan Ops monorepo**:

- Path: `packages/automation-agent/`
- Package: `@ivaan/automation-agent` (`private: true` — not published to npm)
- Main app repo: same clone as IvaanWebOps (e.g. `ivaan-ops` on GitHub)

**Non-technical users:** install the Windows tray app — see [packages/automation-agent-desktop/README.md](../automation-agent-desktop/README.md) and [docs/PRD-DCR-AGENT-DESKTOP.md](../../docs/PRD-DCR-AGENT-DESKTOP.md). Do not ask staff to clone this repo.

Architecture: [docs/DCR-AUTOMATION-ARCHITECTURE.md](../../docs/DCR-AUTOMATION-ARCHITECTURE.md).

From the **repo root**:

```powershell
npm run automation-agent:install
npm run automation-agent:playwright-chromium
npm run automation-agent:build
```

## Setup

```powershell
cd packages/automation-agent
npm install
npx playwright install chromium
npm run build
```

## Pair with Ivaan Ops

1. In Ivaan Ops → **DCR Automation** → **Pair agent**, copy the 6-digit code.
2. Run:

```powershell
npm run pair -- --code 123456 --url http://localhost:3000 --label "Office PC"
```

Config is stored at `%APPDATA%\IvaanOpsAutomation\config.json` on Windows.

Default portal URL (both PCMV and ISE profiles):

[https://solardcrportal.nise.res.in/Account/Login](https://solardcrportal.nise.res.in/Account/Login)

Use **Select Your Company** on the login form for the active profile (PCMV vs ISE). Override URLs in `config.json` only if NISE changes the endpoint.

## Run the agent

```powershell
npm run serve
```

Keep this running while you start automation from Ivaan Ops. The agent will:

1. Send heartbeats to the cloud.
2. Claim queued runs for your user.
3. Open a **headed** browser per portal; you complete login/OTP manually.
4. Run the **stub** workflow (issues `STUB-DCR-*` refs until real portal steps exist).

Force stub failures: `$env:AUTOMATION_STUB_MODE="fail"; npm run serve`

## Dev (without build)

```powershell
npm run dev -- --url http://localhost:3000
```

Use `npm run dev:pair` for pairing via `tsx`.
