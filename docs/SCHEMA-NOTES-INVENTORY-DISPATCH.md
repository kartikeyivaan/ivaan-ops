# Schema Notes — Inventory, Dispatch & Documentation

**Migration:** `prisma/migrations/20260730040000_inventory_dispatch_documentation`  
**Branch:** `feat/inventory-dispatch-documentation`

---

## Decisions Applied

| Topic | Decision |
|-------|----------|
| Booking host | **Extend PI** + emit `InventoryEvent` rows. No separate `bookings` table in v1. |
| Manager booking approval | **Kept** — existing `ApprovalRequest` BOOKING flow remains; PRD allows this when permissions already require it. |
| Sales Executive payments | Permission will expand in booking/payment sprint (`canRecordPayments`). |
| Lot status | Additive enum values; legacy `INCOMING` / `CLOSED` retained. `CLOSED` ≡ received; `INCOMING` remains projection-affecting. |
| Timezone | Application date-only logic uses local calendar dates; document formatting may still use UTC helpers until projection services standardise on Asia/Kolkata date strings. |
| SKU | `product_id` everywhere (no SKU table). |
| Proposal DCR fields | Untouched — solar panel pricing, not Documentation certificates. |

---

## Additive Changes

### Extended enums
- `LotStatus`: + `DRAFT`, `ORDERED`, `IN_TRANSIT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `DELAYED`, `CANCELLED`

### New enums
- `InventoryEventType`, `InventoryEventStatus`
- `DeliveryTermMode` (`ADVANCE_BOOKING`, `READY_STOCK`, `SUBJECT_TO_AVAILABILITY`, `LEGACY`)
- `QuotationWarningType`
- `InvoiceHandoverStatus`
- `DocumentationStatus`

### Extended tables
- `companies.dispatch_cutoff_time`
- `inventory_lots`: arrival window, remarks, reference number
- `quotations`: delivery term columns (default `LEGACY`, `booking_allowed=false`)
- `proforma_invoices`: carried delivery terms + required dispatch date window
- `dispatches`: receiver name/mobile, signature URL, planned dispatch date

### New tables
- `inventory_events` — future projection engine (separate from ledger `inventory_transactions`)
- `inventory_safety_stock`
- `company_working_days`, `company_holidays`
- `warehouse_working_days`, `warehouse_holidays` (optional override)
- `quotation_warning_logs`
- `invoice_handovers` — unique on `dispatch_id`
- `documentation_records` — unique on `dispatch_id` and `invoice_handover_id`
- `documentation_status_history`, `documentation_assignment_history`

### Role
- `Documentation Executive` added to `ROLES` / nav stub `/documentation`

---

## Integrity Constraints

- One invoice handover per dispatch (`invoice_handovers.dispatch_id` unique).
- One documentation record per dispatch and per invoice handover.
- Safety stock unique on `(company_id, warehouse_id, product_id, effective_from)`.
- Opening-stock idempotency enforced in application (one active `OPENING_STOCK` per company/warehouse/product) — not a DB unique constraint yet because status transitions need flexibility.
- Serial uniqueness remains on `inventory_serials.serial_number`.

---

## Intentionally Not in This Migration

- Dropping/renaming legacy columns
- Separate `bookings` / `booking_lines` tables
- Feature-flag tables
- Changing proposal inverter unique indexes (drift ignored)
- Altering user timestamp column types (drift ignored)

---

## Reversibility

Down-migration is not auto-generated. Rollback would:
1. Drop new tables (documentation → invoice_handover → events/safety/working days/warnings)
2. Drop added columns on quotations, PIs, lots, dispatches, companies
3. Leave new `LotStatus` enum values in place (Postgres cannot easily remove enum values)

---

## Follow-up Runtime Work

1. Emit `InventoryEvent` from inward, book, dispatch, transfer, lot arrival updates.
2. Backfill opening stock events (Command 05).
3. Wire delivery terms into quotation UI and PI convert.
4. Enforce receiver fields on dispatch confirm.
5. Create invoice handover on dispatch complete; documentation on invoice record.
