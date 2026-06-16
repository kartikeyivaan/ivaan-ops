# Prompt 10 — Master UAT Checklist

Consolidated user acceptance testing for IvaanOps Sprint 1. Complete after all automated tests pass (`npm run test`).

## Pre-UAT gate

- [ ] `.env` configured with `DATABASE_URL` and `AUTH_SECRET`
- [ ] `npm run db:migrate` — all migrations applied
- [ ] `npm run db:seed` — seed data loaded
- [ ] `npm run test` — all automated tests pass
- [ ] `npm run build` — production build succeeds
- [ ] `npm run dev` — app starts on port 3000

## Role navigation smoke test

Log in as each role and confirm menu visibility:

| Role | Dashboard | Customers | Products | Inventory | Quotations | PI | Dispatch | Reports | Admin |
|------|-----------|-----------|----------|-----------|------------|-----|----------|---------|-------|
| Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sales Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Warehouses only |
| Sales Executive | ✓ | ✓ | ✓ | view | ✓ | ✓ | view | ✓ | — |
| Warehouse | ✓ | view | ✓ | ✓ | view | view | ✓ | ✓ | — |
| Purchase | ✓ | view | ✓ | ✓ | — | — | — | ✓ | — |
| Accounts | ✓ | view | view | view | view | view | view | ✓ | — |

- [ ] Super Admin sees Users, Companies, Warehouses, Audit Logs
- [ ] Purchase user cannot access Quotations, PI, or Dispatch (redirect or 403)
- [ ] Sales Executive cannot access `/admin/users`

## End-to-end golden path

Complete this flow in order using seed data or fresh records:

### 1. Customer (Sales Executive)

- [ ] Create a Dealer customer with valid GST
- [ ] Assign to logged-in sales executive
- [ ] Customer code auto-generates (`ISE-CUST-…`)

### 2. Quotation (Sales Executive)

- [ ] Create quotation for the customer with module + inverter lines
- [ ] WP and unit line totals calculate correctly
- [ ] Send quotation — status becomes SENT
- [ ] Quotation PDF opens

### 3. Proforma Invoice (Sales Executive)

- [ ] Convert sent quotation to PI
- [ ] Quotation status becomes CONVERTED
- [ ] Issue PI — status becomes ISSUED
- [ ] PI PDF opens

### 4. Payment & Booking (Accounts + Manager)

- [ ] Accounts records payment ≥ 50% of PI total
- [ ] Sales requests booking with warehouse selection
- [ ] PI moves to PENDING_BOOKING
- [ ] Manager approves booking — PI becomes BOOKED
- [ ] Inventory shows booked qty for selected warehouse

### 5. Dispatch (Warehouse)

- [ ] New dispatch from booked PI
- [ ] Partial or full qty dispatch with serial selection (if applicable)
- [ ] DC number auto-generates (`ISE-DC-…`)
- [ ] DC PDF opens
- [ ] PI status updates to PARTIALLY_DISPATCHED or FULLY_DISPATCHED

### 6. Reports (Sales Manager)

- [ ] Sales Executive report shows dispatched value for the flow
- [ ] Payment Follow-up reflects outstanding (if partial payment)
- [ ] Product Movement shows dispatch transaction
- [ ] Dispatch report lists the DC line
- [ ] Excel and PDF export work for at least one report

### 7. Customer profile verification

- [ ] Outstanding metric updated after payments
- [ ] Quotations, PI, Payments, Dispatches tabs show history from the flow

## Module sign-off

Walk each module checklist and mark complete. Detail items are in the linked files.

| Module | Checklist | Tester | Date | Pass |
|--------|-----------|--------|------|------|
| 01 Foundation | [PROMPT_01_QA_CHECKLIST.md](./PROMPT_01_QA_CHECKLIST.md) | | | [ ] |
| 02 Customers | [PROMPT_02_QA_CHECKLIST.md](./PROMPT_02_QA_CHECKLIST.md) | | | [ ] |
| 03 Products | [PROMPT_03_QA_CHECKLIST.md](./PROMPT_03_QA_CHECKLIST.md) | | | [ ] |
| 04 Inventory | [PROMPT_04_QA_CHECKLIST.md](./PROMPT_04_QA_CHECKLIST.md) | | | [ ] |
| 05 Transfers | [PROMPT_05_QA_CHECKLIST.md](./PROMPT_05_QA_CHECKLIST.md) | | | [ ] |
| 06 Quotations | [PROMPT_06_QA_CHECKLIST.md](./PROMPT_06_QA_CHECKLIST.md) | | | [ ] |
| 07 PI & Payments | [PROMPT_07_QA_CHECKLIST.md](./PROMPT_07_QA_CHECKLIST.md) | | | [ ] |
| 08 Dispatch | [PROMPT_08_QA_CHECKLIST.md](./PROMPT_08_QA_CHECKLIST.md) | | | [ ] |
| 09 Reports | [PROMPT_09_QA_CHECKLIST.md](./PROMPT_09_QA_CHECKLIST.md) | | | [ ] |

## Cross-cutting checks

- [ ] Company switcher works for admin (ISE ↔ PCMV)
- [ ] Audit log records create/update actions from the golden path
- [ ] Dashboard widgets load for each role without errors
- [ ] Mobile viewport: inwarding and transfer receive screens are usable
- [ ] No negative stock possible after dispatch or transfer
- [ ] Duplicate GST blocked within same company
- [ ] Below-minimum quotation rate requires manager approval before send

## Known seed data shortcuts

For faster UAT, seeded data includes:

- Sample customers (Sunrise Solar Dealers, etc.)
- Sample sent quotation and PI with 50% payment
- Pending booking approval on dashboard
- Booked PI ready for dispatch
- Sample incoming lot and transfer stock

Verify seeded shortcuts work, then run the golden path with fresh records.

## UAT sign-off

| | Name | Signature | Date |
|---|------|-----------|------|
| Tester 1 | | | |
| Tester 2 | | | |
| Product Owner | | | |

**Sprint 1 UAT status:** [ ] Pass  [ ] Fail (issues logged)

Issues found:

1.
2.
3.
