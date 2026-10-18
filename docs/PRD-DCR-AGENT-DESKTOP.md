# PRD — Ivaan Ops DCR Agent (desktop for non-technical users)

**Status:** Phase 1 in progress (installable MVP — tray app, CI installer, download in Ivaan Ops)  
**Owner:** Product / ops (TBD)  
**Related:** [DCR-AUTOMATION-ARCHITECTURE.md](./DCR-AUTOMATION-ARCHITECTURE.md), [DCR-AUTOMATION-ELIGIBILITY.md](./DCR-AUTOMATION-ELIGIBILITY.md)

---

## 1. Problem

Documentation executives need to run **DCR portal automation** from their **Windows PC**. Today the agent only ships as source inside the **Ivaan Ops monorepo** (`packages/automation-agent/`). Setup requires Git, Node, npm, Playwright browser install, and a terminal — unsuitable for **non-technical staff**.

**We need:** install like normal office software, pair once from Ivaan Ops in the browser, then “it just runs” when they start a run.

---

## 2. Goals

| ID | Goal |
|----|------|
| G1 | Any authorized user can **download and install** the agent without cloning a repo or using a terminal. |
| G2 | **Pairing** uses the existing 6-digit flow in Ivaan Ops (no manual `--url` / `--code` flags). |
| G3 | Agent **stays running** in the background (or starts automatically) while the user works in Ivaan Ops. |
| G4 | **Playwright + Chromium** bundled; user does not install Node or browsers separately. |
| G5 | Agent talks only to **configured Ivaan Ops URL** (prod/staging); device token stored securely on disk (today: `%APPDATA%\IvaanOpsAutomation\`). |
| G6 | **Updates** are manageable (at minimum: “new version available” + one-click or IT-deployed MSI). |

---

## 3. Non-goals (this PRD)

- macOS / Linux agents (Windows first; PCM/ISE ops are Windows-heavy).
- Storing portal passwords or OTP in cloud or installer.
- Replacing manual documentation completion in Ivaan Ops.
- Full RPA IDE or user-editable scripts.
- Publishing agent to public npm.

---

## 4. Current state (baseline)

| Layer | State |
|-------|--------|
| Cloud | Queue, executions, pairing API, agent APIs, DCR Automation UI — **MVP done** |
| Agent logic | CLI `pair` / `serve`, Playwright profiles PCMV/ISE, **stub** workflow |
| Distribution | **Developers only** — monorepo scripts |

**Gap:** no installer, no in-app download, no guided pairing UI on desktop.

---

## 5. Target user journey (v1)

```text
  User in Ivaan Ops (browser)
       │
       ├─► "Install agent" → Download IvaanOpsDCRAgentSetup.exe (or MSI)
       │
       ├─► Run installer (admin may be required once)
       │
       ├─► Open "Ivaan Ops DCR Agent" (tray icon or short cut)
       │      First run: "Enter pairing code" OR deep-link from web with code pre-filled
       │
       ├─► Agent shows: Connected ✓  |  Cloud: app.ivaanops.com
       │
       └─► User starts run in web → agent claims work → browser opens for login/steps
```

**Pairing UX preference:** Web shows code + button **“Open in agent”** (`ivaanops-agent://pair?code=…&baseUrl=…`) with fallback **“Copy code”** if protocol handler not registered.

---

## 6. Proposed delivery format

### Recommended v1 packaging

| Component | Choice (proposed) | Rationale |
|-----------|-------------------|-----------|
| Runtime | **Node embedded** in installer (e.g. `pkg`, `nexe`, or **Electron** shell) | Reuse existing TypeScript agent with minimal rewrite |
| Browser | **Playwright bundled Chromium** (install at build time, ship in installer) | Already used; ~150–300 MB installer acceptable for internal tool |
| Installer | **Windows MSI or Inno Setup .exe** | IT-friendly; optional silent install later |
| Background | **System tray app** + optional “Start with Windows” | Non-technical users should not keep PowerShell open |
| Updates | **GitHub Releases** or **S3/Vercel blob** + version check on startup | No Microsoft Store required for v1 |

### Alternative (heavier, nicer UX)

**Electron** tray app: embedded browser for “status only”, main window for pairing/errors, auto-update via `electron-updater`. More work, better polish.

### Not recommended for v1

- “Zip + double-click .bat” — still feels broken for non-technical users.
- Require separate Node LTS install — support burden too high.

---

## 7. Cloud / product changes needed

| Item | Description |
|------|-------------|
| **Download page** | In DCR Automation: link to latest installer + checksum + min agent version |
| **Version API** | `GET /api/automation/agent/releases/latest` (or static JSON on CDN) |
| **Pairing deep link** | Document `ivaanops-agent://` scheme; web UI generates link |
| **Agent version in heartbeat** | Already sent; enforce **min version** when cloud APIs change (optional v1.1) |
| **Help content** | Short FAQ: firewall, first-time portal login, PCMV vs ISE profiles |

No change to eligibility or queue rules.

---

## 8. Security and compliance

- Device token remains **per user per machine**; installer contains **no secrets**.
- HTTPS only to Ivaan Ops; pin or trust system CAs (no custom MITM).
- **Code signing** (Authenticode) strongly recommended before wide rollout (SmartScreen).
- Portal credentials stay in **local Playwright user data dirs** only.
- IT: allowlist outbound HTTPS to Ivaan Ops + NISE portal URL.

---

## 9. Phased plan (suggested)

### Phase 0 — Decision (0.5–1 day)

- Pick packaging stack (Inno + embedded Node **vs** Electron).
- Pick release host (GitHub Releases on `ivaan-ops` **vs** separate `ivaan-dcr-agent` repo).
- Confirm code-signing certificate availability.

### Phase 1 — “Installable MVP” (≈ 1–2 weeks eng)

- CI job: build Windows installer from `packages/automation-agent`.
- Bundle Chromium; smoke test on clean Windows VM.
- Tray or minimal GUI: paired / not paired, connection status, quit.
- Pairing: manual code entry in GUI (no deep link yet).
- Ivaan Ops: **Download agent** button → latest release URL.

**Exit:** Non-dev user can install, pair, run stub workflow against staging.

### Phase 2 — Polish (≈ 1 week)

- Custom URL protocol for one-click pairing from web.
- Start with Windows (optional).
- In-app “Update available” + link to new installer.
- Logging: `%APPDATA%\IvaanOpsAutomation\logs\` for support.

### Phase 3 — Real portal workflow (separate track)

- Replace stub with Playwright steps after portal UX spec.
- Screenshot upload pipeline if needed.

### Phase 4 — IT scale (optional)

- MSI silent install, GPO deployment, internal wiki, min-version enforcement on API.

---

## 10. Effort summary

| Scope | Rough size | Notes |
|-------|------------|--------|
| Phase 1 installable MVP | **Medium–large** | Playwright bundling + installer + GUI shell is the bulk |
| Phase 2 polish | **Small–medium** | Deep link, auto-start, update nags |
| Real portal automation | **Large** | Depends on NISE UI stability (orthogonal to installer) |

**Conclusion:** Treat desktop distribution as a **separate project** from cloud MVP. Do **not** block current DCR automation on installer work; keep dev path for engineers until Phase 1 ships.

---

## 11. Success metrics

- Time from “new hire” to first successful paired agent: **&lt; 15 minutes** without engineering help.
- Support tickets mentioning “npm / git / node”: **zero** after Phase 1.
- % of DCR runs executed via paired agents vs manual portal: track in cloud (device heartbeat + execution `deviceId`).

---

## 12. Open questions

1. **Code signing:** Do we have a cert, or accept SmartScreen warnings for internal pilot?
2. **Single vs multi tenant URL:** Hard-code prod URL in installer, or prompt once at first launch?
3. **Who may download:** Any logged-in user with `canRunAutomation`, or IT distributes file offline?
4. **Separate repo:** Releases cluttering `ivaan-ops` vs clean **`ivaan-dcr-agent`** release repo (still built from monorepo in CI)?
5. **Concurrent machines:** One active device per user vs multiple (today: multiple devices possible; product rule?).

---

## 13. What we do until Phase 1 ships

- **Internal / technical pilot:** monorepo agent + [packages/automation-agent/README.md](../packages/automation-agent/README.md).
- **Product messaging in UI:** “Agent installer coming soon; contact IT” or hide Pair behind feature flag for non-admins.
- **Implement real portal steps** can proceed in parallel on dev machines.

---

## 14. Implementation handoff

When approved, assign **one agent chat** with:

> Implement Phase 1 of `docs/PRD-DCR-AGENT-DESKTOP.md` only. Do not implement Phase 2+ or real portal workflow unless specified.

Include acceptance tests: clean Windows 11 VM, install, pair, claim stub run, complete one attempt.
