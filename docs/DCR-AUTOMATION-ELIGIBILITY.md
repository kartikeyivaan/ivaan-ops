# DCR documentation and automation eligibility

Single source of truth for which dispatches enter documentation, which dispatch lines enter browser automation, and how dual-portal runs behave. Portal-specific Playwright steps are out of scope here.

## Terminology

| Term | Meaning |
|------|---------|
| **DCR panel** | Module product eligible for a government DCR certificate (domestic content). |
| **NDCR / N-DCR** | Non–domestic-content modules; **not** certificate-eligible. |
| **PCMV** | Same as PCM; company code `PCMV`; separate DCR portal login. |
| **ISE** | Company code `ISE`; separate DCR portal login. |
| **Documentation** | Dispatch-level `DocumentationRecord` in Ivaan Ops (manual completion + audit). |
| **Automation queue** | Dispatch-**line**–level work executed by the local agent on a portal. |

Proposal BOM fields (`dcrAdditionalPanels`, `ndcr*`) are **panel pricing**, not this workflow.

---

## Layer A — Documentation (one record per dispatch)

### Dispatch gate

- Dispatch status must be **`DISPATCHED`** (see `dispatch-workflow-eligibility.ts`).

### Product gate

- At least one dispatch line must be a **DCR panel** (`isDcrModuleProduct`).
- Lines whose product name indicates **NDCR** or **N-DCR** are ignored for this count.
- Dispatch with **no** DCR lines → automatically **`NOT_REQUIRED`** (create or update documentation).

### Credit gate

PI `creditStatus` must allow documentation:

| Status | Documentation |
|--------|----------------|
| `NONE`, `REJECTED`, `CLEARED` | Allowed (if DCR lines exist) |
| `APPROVED`, `PENDING_SM`, `PENDING_ACCOUNTS` | **Not** allowed → **`NOT_REQUIRED`** |

### Initial documentation status

When creating or re-evaluating documentation for a dispatch:

- **DCR lines + credit OK** → **`PENDING`**
- Otherwise → **`NOT_REQUIRED`**

Implementation: `resolveDocumentationInitialStatus()` in `src/lib/dcr-documentation-eligibility.ts`.

---

## Layer B — Automation queue (one row per DCR dispatch line)

Automation never decides eligibility by scraping the portal. Ivaan Ops builds the queue from:

1. Parent dispatch documentation status is **`PENDING`** only (`HOLD`, `FOR_REVIEW`, terminal statuses excluded).
2. Line is a **DCR panel** (`isDcrModuleProduct`).
3. PI passes the **credit gate** (same as Layer A).
4. **Invoice / early DCR** (run option):
   - **Default:** invoice must be **recorded** on the handover (`includeEarlyDcr = false`).
   - **Optional:** run flag **Include early DCR** allows lines while documentation is **`PENDING`** before invoice is recorded (`includeEarlyDcr = true`).

After automation succeeds, **do not** auto-set documentation to **`DCR_ISSUED`** in the first release; executor verifies and completes manually.

Implementation: `isAutomationQueueEligibleLine()` and `filterAutomationQueueEligibleLines()`.

---

## DCR product detection

Only **true DCR panel** SKUs are included. There is no product label “not N-DCR”; exclusion is by naming only.

**Exclude** (case-insensitive) if `displayName` contains:

- `NDCR`
- `N-DCR`

**Include** if not excluded and `displayName` contains **`DCR`** as a certificate-eligible module name.

Examples:

| Product name | DCR module? |
|--------------|-------------|
| `Modules - Waaree - TOPCon N-DCR - 615 Wp` | No |
| `Waaree 580Wp NDCR` | No |
| `Waaree 590W DCR` | Yes |
| `Waaree TOPCON DCR Bi-570+Wp Modules` | Yes |

Mixed dispatch: one **`DocumentationRecord`** per dispatch; automation queue only includes **DCR lines**.

---

## Dual portal strategy (PCMV and ISE)

Two external portal logins. A serial may be dispatched under one Ivaan company but must be issued on the other portal.

### Run configuration

When starting an automation run, the user selects:

- **One or more Ivaan companies** they can access (multi-select).
- **Portal strategy:**

| Strategy | Behaviour |
|----------|-----------|
| `PCMV_THEN_ISE` (default) | Try **PCMV** portal first; failed lines retry on **ISE**. |
| `ISE_THEN_PCMV` | Reverse order. |
| `PCMV_ONLY` | Single portal: PCMV. |
| `ISE_ONLY` | Single portal: ISE. |

Manual login is required per portal session; credentials are not stored in Ivaan Ops.

### Per-line attempts

- Each queue line may have multiple **portal attempts** (PCMV, then ISE when using dual pass).
- If all configured portal attempts **fail** → line marked for **manual** processing; dispatch documentation stays **`PENDING`** (not `NOT_REQUIRED`, not auto `DCR_ISSUED`).
- Idempotency: before retry on the second portal, reconcile to avoid duplicate DCR issuance on the first portal.

Constants: `DCR_PORTAL_TARGETS`, `DCR_PORTAL_STRATEGIES` in `dcr-documentation-eligibility.ts`.

---

## Local agent (reference)

- One agent per Windows user; may serve all companies that user can access.
- Outbound HTTPS to Ivaan Ops; no portal passwords in cloud.
- Persistent browser profiles (separate profiles per portal recommended).

---

## Related code

| File | Role |
|------|------|
| `src/lib/dcr-documentation-eligibility.ts` | Pure eligibility helpers |
| `src/lib/dcr-documentation-eligibility.test.ts` | Vitest |
| `src/lib/dispatch-workflow-eligibility.ts` | `DISPATCHED` gate |
| `src/lib/documentation-service.ts` | Early DCR mark uses Layer A on create |
| `src/lib/invoice-handover-service.ts` | Invoice recording uses Layer A on create |
| `src/lib/pi-credit.ts` | Trade credit helpers |

---

## Database (Prisma)

Migration `20261004180000_dcr_automation_engine`:

| Table | Purpose |
|-------|---------|
| `automation_devices` | Paired local agent per user (`secret_hash`, heartbeat) |
| `automation_device_pairing_codes` | Short-lived pairing codes |
| `automation_executions` | A user-started run (portal strategy, early DCR flag, progress) |
| `automation_execution_companies` | Companies included in a run (multi-select) |
| `automation_queue_items` | One row per **dispatch line** (unique `dispatch_line_id`) |
| `automation_portal_attempts` | PCMV/ISE attempt per line per execution |
| `automation_execution_events` | Append-only run log |
| `automation_screenshots` | Failure captures linked to an attempt (`storage_url`) |

Enums align with `src/lib/dcr-documentation-eligibility.ts` portal strategy helpers where applicable.

## HTTP API (step 2)

Session routes (Documentation Executive / Super Admin / Accounts view where noted):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/automation/queue` | List queue (`companyIds`, `includeEarlyDcr`, `status`) |
| `POST` | `/api/automation/queue` | Sync queue rows for `{ companyIds }` |
| `GET` | `/api/automation/executions` | Recent runs |
| `POST` | `/api/automation/executions` | Start run |
| `GET` | `/api/automation/executions/[id]` | Run detail + attempts + screenshots |
| `DELETE` | `/api/automation/executions/[id]` | Cancel run |
| `GET` | `/api/automation/agent/status` | User’s paired devices / online hint |
| `POST` | `/api/automation/devices/pair` | Issue pairing code |

Agent routes (`Authorization: Bearer {deviceId}.{deviceSecret}`):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/automation/agent/register` | Exchange pairing code for device credentials |
| `POST` | `/api/automation/agent/heartbeat` | Keep-alive |
| `POST` | `/api/automation/agent/executions/claim` | Claim queued run for device owner |
| `PATCH` | `/api/automation/agent/attempts/[id]` | Report portal attempt result |
| `GET` | `/api/automation/agent/executions/[id]/pending-attempts` | Pending attempts after portal switch |

Implementation: `src/lib/automation-service.ts`, `src/lib/automation-device-auth.ts`.

Local agent package: `packages/automation-agent` (see README there).

## External portal (login)

NISE DCR Verification Portal login (shared URL; company chosen on the form):

[https://solardcrportal.nise.res.in/Account/Login](https://solardcrportal.nise.res.in/Account/Login)

Local agent defaults: `DCR_PORTAL_LOGIN_URL` in `packages/automation-agent/src/constants.ts`. PCMV and ISE use **separate browser profiles** on the same URL.

## Not in this document

- Post-login navigation, field mapping, or Playwright selectors for issuing DCR.
- UI: `/documentation/automation` and run detail `/documentation/automation/executions/[id]`.
- Auto **`DCR_ISSUED`** after successful automation (held for manual verification).
