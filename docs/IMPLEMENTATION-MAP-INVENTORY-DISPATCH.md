# Implementation Map — Inventory, Dispatch & Documentation

**Source PRD:** `docs/PRD-INVENTORY-DISPATCH-DOCUMENTATION.md`  
**Branch:** `feat/inventory-dispatch-documentation`  
**Audit date:** 2026-07-30  
**Scope:** Discovery only — no application behaviour or migrations in this step

---

## 1. Current Architecture

| Layer | Choice |
|--------|--------|
| Framework | Next.js 15.3 App Router (`src/app/`) |
| UI | React 19, Tailwind CSS 4, Radix UI, CVA, lucide-react |
| Forms | react-hook-form + Zod (`src/lib/validations.ts`) |
| ORM / DB | Prisma 6.9 → PostgreSQL (`DATABASE_URL` / `DIRECT_URL`) |
| Migrations | Prisma Migrate under `prisma/migrations/` (~28 migrations) |
| Auth | NextAuth v5 Credentials + Prisma adapter (`src/lib/auth.ts`, `src/middleware.ts`) |
| PDF / Excel | pdfkit, xlsx |
| Testing | Vitest (node), colocated `src/lib/*.test.ts` — **205 tests passing** |
| Deploy | Vercel (`scripts/vercel-build.mjs`) |

**Not used:** tRPC, Next.js `"use server"` actions, feature-flag framework.

**Request pattern:**
1. UI page / client component
2. `fetch('/api/...')` → Route Handler in `src/app/api/**/route.ts`
3. Permission check (`canX(session.user.roles)`) + company scope
4. Domain service (`*-service.ts`) → Prisma transaction + `writeAuditLogTx`

```
src/
├── app/(app)/          # authenticated pages
│   ├── admin/          # users, companies, warehouses, audit
│   ├── inventory/      # stock, incoming, ledger, transfers, dispatches
│   ├── purchase/       # incoming, vendors
│   ├── sales/          # customers, quotations, proforma-invoices
│   ├── reports/, service/, projects/, masters/, dashboard/
│   └── api/            # REST Route Handlers (primary write path)
├── components/         # feature UI + ui/ primitives
└── lib/                # services, permissions, rbac, audit, validations
```

---

## 2. Existing Table / Model Mapping

**Naming note:** There is no separate SKU model. PRD `sku_id` maps to `Product.id` (`products`).

| PRD concept | Existing model / table | Status |
|-------------|------------------------|--------|
| Company | `Company` → `companies` | Reuse |
| Warehouse | `Warehouse` → `warehouses` | Reuse |
| Product / SKU | `Product` (+ category, brand, tech, prices) | Reuse |
| Physical / incoming lot | `InventoryLot` → `inventory_lots` | **Extend** |
| Serial stock | `InventorySerial` → `inventory_serials` | Reuse / extend |
| Past stock ledger | `InventoryTransaction` → `inventory_transactions` | Keep separate; **do not overload** as projection events |
| Transfers | `InventoryTransfer*` | Reuse; later emit projection events |
| Quotation | `Quotation` / `QuotationItem` | **Extend** with delivery terms |
| PI | `ProformaInvoice*` | Reuse as booking/dispatch host; optionally add booking fields |
| Payment | `Payment` → `payments` | Reuse / permission expand |
| Booking | PI status + `BOOK` txn + serial `BOOKED` | **Adapt** (no separate Booking table today) |
| Dispatch / DC | `Dispatch*` + `dispatch-pdf.ts` | **Extend** |
| Approvals | `ApprovalRequest` (`QUOTATION`, `BOOKING`, `DC_CANCEL`) | Reuse |
| Audit | `AuditLog` → `audit_logs` | Reuse / optional field-level helper |
| Notifications | `Notification` model | Schema exists; **unused in app code** |
| Roles | `Role` / `UserRole` / `UserCompany` | Extend seed roles |
| invoice_handover | — | **Create** |
| documentation_records | — | **Create** (ignore proposal `dcr*` fields — solar panel pricing, not certificates) |
| inventory_events | — | **Create** |
| inventory_safety_stock | — | **Create** |
| company_working_days / holidays | — | **Create** |
| quotation_warnings_log | — | **Create** |

### Key existing fields (current gaps called out)

**`InventoryLot`:** `purchaseDate`, status `INCOMING | CLOSED` only. Missing expected min/max arrival and rich statuses.

**`Quotation`:** no delivery-term columns.

**`ProformaInvoice`:** booking via `bookedAt` / status; fixed 50% advance in `BOOKING_ADVANCE_PERCENT` (`src/lib/proforma-invoices.ts`).

**`Dispatch`:** optional `vehicleNo`, `driverName`. Missing receiver name/mobile, signature, invoice handover fields.

**`Payment`:** PI-linked; `canRecordPayments` allows Super Admin / Sales Manager / Accounts — **not** Sales Executive.

### Seeded roles (`src/lib/rbac.ts`)

`Super Admin`, `Sales Manager`, `Sales Executive`, `Projects Manager`, `Projects Sales Executive`, `Warehouse`, `Purchase`, `Accounts`, `Service Executive`

**Missing vs PRD:** plain Admin, Purchase Manager (map to `Purchase`), Documentation Executive, Dispatch Executive (map to `Warehouse`).

---

## 3. Required Schema Changes (additive)

Do not delete or rename production columns in first rollout.

### New enums / tables (proposed)

| Entity | Purpose |
|--------|---------|
| `InventoryEvent` + event type/status enums | Future projection engine |
| `InventorySafetyStock` | Per company + warehouse + product override; default 100 in code |
| `CompanyWorkingDay` / `CompanyHoliday` | Working-day helper; optional warehouse override later |
| Quotation delivery-term columns (or related table) | Mode, booking allowed, payment %, min/max days, note snapshot |
| `QuotationWarningLog` | Non-blocking warning acceptance audit |
| `InvoiceHandover` | Accounts queue after dispatch complete |
| `DocumentationRecord` + `DocumentationStatusHistory` | Post-invoice DCR workflow |
| Company `dispatchCutoffTime` (optional column) | Ready-stock same-day cut-off |

### Extend existing

| Entity | Additive fields |
|--------|-----------------|
| `InventoryLot` | `expectedMinDate`, `expectedMaxDate`, expanded status enum (map carefully from `INCOMING`/`CLOSED`), remarks |
| `Dispatch` | `receiverName`, `receiverMobile`, `signatureUrl` (or file ref); keep `driverName` |
| `ProformaInvoice` and/or new booking link | Carry delivery terms; dispatch date window; optional release |
| `Company` | Optional cut-off / working-day defaults |
| `Role` seed | Documentation Executive |

### Booking strategy (decision for Sprint 2 schema)

**Recommended:** Keep PI as the operational booking host (matches current UI/API). Add quotation delivery terms + projected-stock checks + reservation `InventoryEvent` rows keyed by PI. Introduce a separate `Booking` table only if multi-booking-per-PI becomes required; PRD allows one PI with multiple dispatches, which already exists.

### Do not confuse

- Proposal `dcrAdditionalPanels` / `ndcr*` = solar DCR **panel pricing**, not Documentation certificates.
- `InventoryTransaction` = historical ledger. Projection uses new `InventoryEvent`.

---

## 4. Reusable Services / Components

| Area | Reuse |
|------|--------|
| Permissions | `inventory-permissions.ts`, `pi-permissions.ts`, `dispatch-permissions.ts`, `quotation-permissions.ts`, `report-permissions.ts` |
| Audit | `writeAuditLog` / `writeAuditLogTx` in `src/lib/audit.ts` |
| Stock math | `getWarehouseStockForProduct` in `inventory-service.ts` (must evolve for safety stock + non-serial booked qty) |
| Incoming lots | `inventory-service.ts` + `/api/inventory/incoming` + purchase/incoming UI |
| Booking | `pi-service.ts` (`bookInventoryForPi`), approve-booking routes |
| Payments | `recordPayment`, Payment model, PI detail UI |
| Dispatch / DC | `dispatch-service.ts`, `dispatch-pdf.ts`, serial lookup APIs |
| Transfers | `transfer-service.ts` |
| Reports / Excel | `report-service.ts`, `getBookedAvailableReport` |
| UI primitives | `src/components/ui/*` (card, badge, table, modal, typeahead, collapsible-filter-card) |
| Timeline geometry | `timeline-roadmap` components (possible visual reuse for 15-day strip) |
| RBAC / nav | `src/lib/rbac.ts` |
| Validations | Zod in `src/lib/validations.ts` |

---

## 5. Risk Areas

1. **Non-serial booking gap:** `getWarehouseStockForProduct` returns `bookedStock: 0` for non-serial products; available = received − damaged. Overbooking is possible today.
2. **Dual stock systems:** Adding `InventoryEvent` without syncing from lot inward, PI book, dispatch, and transfer will diverge from physical stock.
3. **Fixed 50% advance vs quotation modes:** Replacing `BOOKING_ADVANCE_PERCENT` affects all existing PIs; need LEGACY / backfill rules.
4. **Booking approval vs PRD auto-activate:** Current flow requires Sales Manager approval (`ApprovalRequest` BOOKING). Changing this is a product/permission decision.
5. **Lot status enum expansion:** Migrating `INCOMING`/`CLOSED` to richer statuses without breaking inward/receipt flows.
6. **Serial uniqueness:** Global unique `serialNumber` already exists; PRD also needs completed-dispatch reuse rejection (largely covered by `DISPATCHED` status).
7. **Payment permission:** PRD lets Sales Executive record payment; current code forbids it — intentional change, needs tests.
8. **Timezone:** Document dates often use UTC helpers; projection and ageing need a consistent local timezone policy.
9. **Notification table unused:** Wiring PRD notifications requires new write/read paths.
10. **Service / Proposal modules:** Explicitly out of scope — do not regress.

---

## 6. Migration Strategy

1. Additive Prisma migrations only; no column deletes/renames in first rollout.
2. Expand enums with new values; keep old values valid.
3. Backfill quotation delivery terms as LEGACY / SUBJECT_TO_AVAILABILITY with `booking_allowed = false` unless safely inferable.
4. Create opening `InventoryEvent` snapshots from current warehouse stock (idempotent script — Command 05).
5. Reconcile projected vs physical before enabling Sales Timeline in production.
6. Feature flags: none exist today — prefer role/route gating and gradual UI rollout unless a flag system is added later.
7. Keep `InventoryTransaction` writes unchanged for current ledger; emit parallel projection events from the same transactions when inventory-affecting actions run.

---

## 7. Proposed Implementation Sequence

Aligned with PRD sprints and Cursor Command Pack:

| Sprint | Focus | Commands |
|--------|--------|----------|
| 1 | Schema, migrations, audit/role foundation | 02 |
| 2 | Inventory events, projection, safety stock, working days, incoming lots | 03–08 |
| 3 | Quotation delivery terms, warnings, payment/booking eligibility, reservations | 09–13 |
| 4 | Sales inventory timeline API + UI | 14–15 |
| 5 | Planned/actual dispatch, serials, signature, accounts invoice queue | 16–21 |
| 6 | Documentation role, records, UI, ageing | 22–25 |
| 7 | Reports, notifications, full tests, UAT, release checklist | 26–30 |

---

## 8. Conflicts Between PRD and Existing Code

| Topic | Existing | PRD | Resolution approach |
|-------|----------|-----|---------------------|
| Booking host | PI + serial BOOKED | Separate bookings table | Prefer extend PI + events first |
| Advance % | Hardcoded 50% | Quotation modes (Y%, 100%, none) | Terms-driven; legacy PIs keep 50% or LEGACY |
| Booking approval | Manager required | Activate when payment met | Keep approval unless product decides otherwise; document decision in schema notes |
| Incoming dates | `purchaseDate` only | Min/max arrival window | Additive columns |
| Lot statuses | INCOMING / CLOSED | ORDERED…DELAYED… | Expand enum; map CLOSED→RECEIVED |
| Future inventory | Ledger only | Dated signed events | New `InventoryEvent` |
| Safety stock | None | Default 100 + overrides | New table + sales-available calc |
| Dispatch mandatory fields | vehicle/driver optional | Receiver, mobile, vehicle, serials | Additive; enforce on confirm |
| Roles | Warehouse, Purchase | Dispatch Exec, Purchase Manager, Doc Exec, Admin | Map + add Documentation Executive |
| Sales payment | SE cannot record | SE can record | Expand `canRecordPayments` carefully |
| Documentation DCR | Missing (proposal DCR ≠ this) | Post-invoice certificates | New module |
| Warnings | None | PCM + cross-company | New evaluate + log |
| Working days | None | `getNextWorkingDate` | New config + helper |
| Audit shape | Whole JSON snapshot | Field-level + reason | Optional helper; keep existing AuditLog |

---

## 9. What Already Satisfies Parts of the PRD

- Incoming lot create/edit, partial inward, serial capture
- Physical + incoming stock views; transfers between warehouses/companies
- Quotation → PI convert, numbering, PDF
- Payments against PI and outstanding calculation
- Booking gate (fixed 50%), manager approval, serial reservation + BOOK transaction
- Partial dispatch, DC PDF, serial scan/lookup, cancel-approval flow
- Booked vs Available report with Excel/PDF export
- Company scoping, RBAC, audit logging throughout
- ApprovalRequest for BOOKING / DC_CANCEL / quotation price

---

## 10. Permission and API Patterns to Follow

- Server-side checks in every Route Handler via `*-permissions.ts`
- `auth()` + `requireActiveCompany(session)` where applicable
- Typed service errors → JSON `{ code, message }`
- Zod validation before service calls
- Mutations inside `prisma.$transaction` with `writeAuditLogTx`
- Colocated Vitest unit tests for pure logic and permission helpers

**Existing APIs to extend (not replace):**

- `/api/inventory/incoming/**`
- `/api/quotations/**`
- `/api/proforma-invoices/**` (payments, request-booking, approve-booking)
- `/api/dispatches/**`
- `/api/reports/booked-available`

**New APIs (later sprints):** projected inventory, safety stock, delivery terms, warning confirm, booking release, invoice queue, documentation queue.

---

## 11. Sprint 1 — Exact Files Expected to Change

Discovery/schema sprint only (Command 02 next). Expected touch list:

### Must change
- `prisma/schema.prisma` — additive models, enums, relations
- `prisma/migrations/<timestamp>_inventory_dispatch_foundation/migration.sql` — new migration
- `prisma/seed.ts` — Documentation Executive role (and any defaults)
- `docs/SCHEMA-NOTES-INVENTORY-DISPATCH.md` — schema decisions (Command 02 deliverable)

### Likely change for foundation readiness
- `src/lib/rbac.ts` — new role constant + nav stubs (Documentation)
- `src/lib/audit.ts` — optional reason / field-level helper (non-breaking)
- `src/lib/validations.ts` — Zod schemas for new entities
- `src/types/next-auth.d.ts` — only if role typing requires it

### Read-only inspection in Sprint 1 (edit in later sprints)
- `src/lib/inventory-service.ts`
- `src/lib/pi-service.ts`
- `src/lib/proforma-invoices.ts`
- `src/lib/dispatch-service.ts`
- `src/lib/quotation-service.ts`
- `src/lib/report-service.ts`
- `src/lib/transfer-service.ts`
- `src/components/quotations/quotation-form.tsx`
- `src/components/dispatches/dispatch-form.tsx`
- `src/components/proforma-invoices/proforma-invoice-detail.tsx`
- `src/components/purchase/incoming-create-form.tsx`

### Explicitly do not change in Sprint 1
- Service module (`src/lib/service-service.ts`, service UI)
- Project proposal / DCR panel pricing logic
- Pricing calculation paths on quotations

---

## 12. Baseline Verification

| Check | Result |
|-------|--------|
| Working tree before PRD | Clean on `main` |
| PRD added | `docs/PRD-INVENTORY-DISPATCH-DOCUMENTATION.md` |
| Feature branch | `feat/inventory-dispatch-documentation` |
| Test suite | `npm test` — 31 files, **205 passed** |

---

## 13. Open Product Decisions (resolve before / during Command 02)

1. **Booking host:** Extend PI vs new `Booking` table — recommendation: extend PI + `InventoryEvent`.
2. **Keep manager booking approval?** PRD prefers payment-threshold activation; current app requires approval.
3. **Sales Executive payment recording:** Expand permissions as PRD states?
4. **Lot status migration mapping:** Confirm CLOSED ≡ RECEIVED and how PARTIALLY_RECEIVED maps to current partial inward.
5. **Timezone for projections:** Confirm Asia/Kolkata (or company setting) vs current UTC document formatting.
)
