# Implementation Plan: Monthly Serial Number Audit

Source: [prd-monthly-serial-audit.md](prd-monthly-serial-audit.md) (approved)
Date: 2026-11-21

## 1. What already exists (reuse)

- `InventorySerial` ([prisma/schema.prisma](../prisma/schema.prisma):1347): serial number, product, status (`SerialStatus`: AVAILABLE, BOOKED, DAMAGED, DISPATCHED, DAMAGE_PENDING, REMOVED), and `currentWarehouseId`. Live uniqueness is a partial unique index in SQL.
- Freeze hook: `assertInventoryOpsAllowed` in [inventory-audit-service.ts](../src/lib/inventory-audit-service.ts):128 already blocks incoming, dispatch, transfer and adjust for a company. The monthly run adds one more condition to it.
- Stock updates: [manual-stock-service.ts](../src/lib/manual-stock-service.ts) and [inventory-service.ts](../src/lib/inventory-service.ts) hold the existing stock-change logic. Approval should go through them, not raw writes.
- Audit module pattern to copy: `*-service.ts`, `inventory-audit-api.ts` (error mapping), `inventory-audit-permissions.ts`, API routes under `src/app/api/inventory/audits/`, and workbench components under `src/components/inventory/`.
- Migrations: `prisma/migrations/<timestamp>_<name>/`.

## 1a. Scope exclusions

- **Ivaan Demo is out of scope of the monthly audit.** Its serials are not snapshotted, its quantity lines are not created, and it is not counted in reconciliation or approval.
- Ivaan Practice is also excluded, for the same reason (demo and practice companies).
- Implemented with the name filter `monthlyAuditCompanyFilter` in [monthly-serial-audit-scope.ts](../src/lib/monthly-serial-audit-scope.ts), used by the start snapshot ([monthly-serial-audit-service.ts](../src/lib/monthly-serial-audit-service.ts)), the quantity lines ([monthly-serial-audit-lines.ts](../src/lib/monthly-serial-audit-lines.ts)) and approval ([monthly-serial-audit-approve.ts](../src/lib/monthly-serial-audit-approve.ts)).
- Open point: the freeze guard `assertMonthlyAuditAllowsMovement` is not company-scoped, so while a run is OPEN it also blocks incoming, transfer, adjust and dispatch for Ivaan Demo. Decide whether the freeze should skip excluded companies.

## 2. Data model (new)

- `InventoryMonthlyAudit`: id, auditNumber, status (DRAFT, OPEN, CLOSED, APPROVED, CANCELLED), startedById, startedAt, closedAt, approvedById, approvedAt, cancelledAt, cancelReason, reopenedCount.
- `InventoryMonthlyAuditSerialSnapshot`: auditId, serialId, serialNumber, productId, companyId, warehouseId, status at snapshot.
- `InventoryMonthlyAuditScan`: auditId, serialNumber (normalized), scannedById, scannedAt, source (CAMERA, SCANNER, PASTE), matchedSerialId (nullable), result (FOUND, UNKNOWN, ALREADY_SCANNED).
  - Unique on (auditId, serialNumber) so a second scan is rejected at the database level, not only in code.
- `InventoryMonthlyAuditFinding`: auditId, serialNumber or productId, type (MISSING, ADDITIONAL), investigationNote, resolvedById, resolvedAt.
- `InventoryMonthlyAuditQtyLine` (section B): auditId, productId, companyId, warehouseId, recordQty, auditQty, variance, approved flag.
- Enum `MonthlyAuditStatus`.

Decision needed before migration: whether snapshot rows copy the full expected list (large) or only record the snapshot time and compare live. The PRD implies a fixed snapshot, so copy the rows.

## 3. Business rules (from PRD section 6)

- One OPEN run at a time, across all companies.
- Start: snapshot all AVAILABLE serials. Exclude pending purchase, transit (none per PRD).
- Freeze: from start until the audit is marked CLOSED (complete), incoming, transfer and adjust are blocked. Dispatch is allowed again once the run is CLOSED, while Super Admin approval is still pending.
- Scan: normalize serial (`normalizeSerialNumber`), then:
  - in snapshot and not yet scanned → FOUND;
  - already scanned → ALREADY_SCANNED (shown to the user, not recorded again);
  - not in snapshot → ADDITIONAL (recorded, goes to the findings list).
- Close: Missing = snapshot serials with no scan. Build Excel report.
- Approve (Super Admin only):
  - OK serials: no change (already AVAILABLE).
  - Missing: listed for investigation. Status is not changed by the audit, per "goes for investigation." Super Admin records a finding for each.
  - Additional: listed; not added to inventory. Added later via manual stock entry.
  - Section B: set inventory quantity to auditQty for approved lines, through the stock service.
- Cancel: allowed while OPEN or CLOSED, before approval. Reopen: CLOSED → OPEN.
- Lock after APPROVED.

## 4. API (new routes)

- `POST/GET /api/inventory/monthly-audits` — create (starts run, takes snapshot), list.
- `GET /api/inventory/monthly-audits/[id]` — run detail, counts.
- `POST /api/inventory/monthly-audits/[id]/scans` — single serial or pasted list (array, split and normalized server-side).
- `GET /api/inventory/monthly-audits/[id]/exceptions` — Missing and Additional lists.
- `PATCH /api/inventory/monthly-audits/[id]/qty-lines/[lineId]` — section B counts.
- `POST /api/inventory/monthly-audits/[id]/close | reopen | cancel | approve`.
- `GET /api/inventory/monthly-audits/[id]/report.xlsx` — Excel export.

Permissions: start, close, reopen, cancel, approve, export = Super Admin. Scan and section B entry = Super Admin or Warehouse. Approve checks Super Admin again on the server.

## 5. UI (new)

- Run list and create page (Super Admin).
- Scan page: camera scanner, handheld input (keyboard wedge), paste box. Shows result per scan (Found / Already scanned / Additional) and running totals. Several users can use it at once; the server enforces uniqueness.
- Section B page: quantity entry per product, with the expected quantity shown next to it.
- Exceptions page: Missing and Additional lists, investigation notes, Excel export.
- Approve screen with the reconciliation summary before confirming.

## 6. Phases

1. **Schema and migration** — models, enum, unique constraints. Test migration on a copy of the database.
2. **Run lifecycle service** — create with snapshot, freeze hook, close, cancel, reopen. Unit tests.
3. **Scanning service** — normalization, classification, concurrency test (two simultaneous scans of the same serial: one FOUND, one ALREADY_SCANNED).
4. **Reconciliation and approval** — Missing/Additional lists, section B variance, approve through stock services, atomic transaction. Tests for each row of the PRD table.
5. **API routes and permissions** — with permission tests (Warehouse cannot approve).
6. **UI** — scan page first (most used), then exceptions, approve, run list.
7. **Excel export.**
8. **Pilot** — dry run on a test company before production.

## 7. Test plan

- Snapshot correctness across companies and warehouses.
- Concurrent scanning by multiple users (database-level uniqueness).
- Freeze: incoming/dispatch/transfer/adjust rejected while OPEN.
- Approval is all-or-nothing (inject a failure mid-approval, nothing changes).
- Each row of the reconciliation table.
- Cancel and reopen state rules.
- Permissions per role.

## 8. Risks and open points

- **Scale:** the snapshot and pasted lists may be large (thousands of serials). Batch the inserts and the paste parsing.
- **Freeze length:** incoming, transfer and adjust stay blocked for the whole scanning period. Show a clear banner so users know why.
- **Dispatch during approval:** dispatch runs after CLOSED, while approval is pending. A serial dispatched in that window will be in the snapshot but no longer AVAILABLE. Approval must re-check each serial's current status and report any that changed, rather than assume the snapshot is still true.
- **Excel library:** check which Excel library the project already uses before adding one.

## 9. Progress

- **Phase 1 (schema and migration): done, not yet applied to a database.**
  - Models and enums added to [prisma/schema.prisma](../prisma/schema.prisma) (`InventoryMonthlyAudit`, `...Snapshot`, `...Scan`, `...Finding`, `...QtyLine`), with back-relations on Company, Warehouse, Product, InventorySerial and User.
  - Migration: `prisma/migrations/20261121120000_monthly_serial_audit/migration.sql`. The SQL was generated from the schema diff and is additive only (new tables, enums, indexes and foreign keys; no drops or alters).
  - `prisma validate` passes, the Prisma client regenerates, and `tsc --noEmit` reports no errors.
  - Not verified: applying the migration to a real database. This machine has no `DATABASE_URL` in `.env`, so `prisma migrate deploy` has not run.

- **Phase 2 (run lifecycle service): done.**
  - [src/lib/monthly-serial-audit-service.ts](../src/lib/monthly-serial-audit-service.ts): start (with serial snapshot and an advisory lock against double starts), close (builds Missing and Additional findings), cancel (reason required), reopen (CLOSED to OPEN), and the freeze guard.
  - Freeze wired into [incoming](../src/app/api/inventory/incoming/route.ts), [transfers](../src/app/api/inventory/transfers/route.ts) and [adjust](../src/app/api/inventory/adjust/route.ts). Dispatch is not blocked.
  - Tests: [monthly-serial-audit-service.test.ts](../src/lib/monthly-serial-audit-service.test.ts), 6 passing. `tsc --noEmit` clean.
  - Deferred to later phases: non-serialized quantity lines (section B) are not created at start yet. Audit log actions use the existing enum (CREATE, UPDATE, CANCEL), and the event name is in the logged values.

- **Phase 3 (scanning service): done.**
  - [src/lib/monthly-serial-audit-scan.ts](../src/lib/monthly-serial-audit-scan.ts): `recordMonthlyAuditScans` accepts camera, scanner or pasted text. It normalises and de-duplicates the input, caps a request at 5,000 serials, and classifies each one as FOUND, ADDITIONAL or ALREADY_SCANNED. `getMonthlyAuditScanSummary` gives live counts.
  - Concurrency: the run row is locked with `SELECT ... FOR UPDATE` for each batch. Close takes the same lock, so no scan can land between building findings and closing.
  - Tests: [monthly-serial-audit-scan.test.ts](../src/lib/monthly-serial-audit-scan.test.ts). Together with Phase 2, 12 tests pass and `tsc --noEmit` is clean.
  - Not yet verified: the lock behaviour under real concurrent requests. It needs a database, which isn't available here. That test belongs with the migration step.

- **Phase 4 (reconciliation and approval): done.**
  - [src/lib/monthly-serial-audit-approve.ts](../src/lib/monthly-serial-audit-approve.ts):
    - `createMonthlyAuditQtyLines`: section B lines per non-serialized product, company and warehouse, with the system quantity.
    - `updateMonthlyAuditQtyLine`: warehouse count entry, OPEN only.
    - `getMonthlyAuditReconciliation`: Missing, Additional and count totals, plus section B lines.
    - `approveMonthlyAudit`: refuses if any count is missing, locks the run, re-checks serials and reports those that left AVAILABLE, applies section B differences through `adjustStock`, and marks the run APPROVED. All in one transaction.
  - [src/lib/inventory-service.ts](../src/lib/inventory-service.ts): `adjustStock` takes an optional transaction client. Without one it behaves as before. Existing inventory tests pass (78).
  - Tests: [monthly-serial-audit-approve.test.ts](../src/lib/monthly-serial-audit-approve.test.ts). With Phases 2 and 3, 16 tests pass and `tsc --noEmit` is clean.
  - Decisions to confirm: approval writes no serial changes (OK serials stay, Missing waits for investigation, Additional goes to manual stock entry). Section B lines are created by a separate call, `createMonthlyAuditQtyLines`, which Phase 5 must call after start.
  - Not verified: the approval transaction against a real database. Stock reads for section B happen just before the write, so a dispatch in that moment could shift the result by the dispatched quantity.

## 10. Next step

- **Phase 5 (API routes and permissions): done.**
  - Routes under `src/app/api/inventory/monthly-audits/`:
    - `GET`, `POST` (start, then section B lines; the create skips existing lines, so re-running is safe)
    - `[id]` GET: detail, scan progress, reconciliation
    - `[id]/scans` GET and POST: scan summary and scan recording
    - `[id]/qty-lines/[lineId]` PATCH: section B count
    - `[id]/close`, `cancel`, `reopen`, `approve`: POST
    - `[id]/report` GET: Excel report (Summary, Missing, Additional, Non-serialized sheets)
  - Permissions in [monthly-serial-audit-permissions.ts](../src/lib/monthly-serial-audit-permissions.ts): start, close, cancel, reopen, approve and export are Super Admin only. Scanning and counts are Super Admin and Warehouse. Viewing uses the inventory audit viewing roles. Runs are not tied to the active company.
  - Tests: 21 pass across the monthly audit modules, and `tsc --noEmit` is clean.
  - Not verified: the routes have not been called over HTTP and the Excel file has not been opened. The database migration is still unapplied.

## 10. Next step

- **Phase 6 (UI): built, not yet run in a browser.**
  - Pages: [/inventory/monthly-audits](../src/app/(app)/inventory/monthly-audits/page.tsx) (run list and Start button, Super Admin) and `/inventory/monthly-audits/[id]` (the workbench).
  - Components: [monthly-audit-list.tsx](../src/components/inventory/monthly-audit-list.tsx) and [monthly-audit-workbench.tsx](../src/components/inventory/monthly-audit-workbench.tsx).
  - The workbench has camera and handheld scanning (reusing the existing `SerialScanner`), a paste box, live counts that refresh every 20 seconds while OPEN, section B count entry (saved on blur), the Missing and Additional lists after close, and Close, Reopen, Approve and Cancel actions. The Excel download is linked.
  - There is no link to these pages from the main navigation yet. The URL is `/inventory/monthly-audits`.
  - Checks: `tsc --noEmit` is clean and the 21 monthly audit tests pass. Not verified: the pages in a browser, because they need a running app and a database.

## 10. Next step

Apply the migration to a database, then test the full flow end to end (start, scan, count, close, approve, Excel). Also add a navigation link. Both need your database and a test company.

## 11. Phase 7: investigation (in progress)

- Decided: Missing serials go to Under Investigation (missing) on approval; scanned serials the system shows as sold or removed go to Under Investigation (new addition). Serials stay in the system.
- Sold: follows the regular dispatch process. Investigation serials can be booked and dispatched; on dispatch the open finding closes with resolution SOLD.
- Done: schema (UNDER_INVESTIGATION status, resolution fields), two migrations (applied to the test copy only), approval marking, dispatch lookup/booking/sale hook. Type check clean; library tests pass except the unrelated navigation test in uat.test.ts.
- Remaining: investigation tabs in the UI; resolve Found (back to available), Write off (removed) and New addition (added via manual stock entry); tests for these; apply both migrations to live after testing.
