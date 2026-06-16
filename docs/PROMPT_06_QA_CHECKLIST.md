# Prompt 06 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for quotations migration
- [ ] Run `npm run db:seed` for sample quotations

## Permissions

- [ ] Sales Executive can create and view quotations
- [ ] Sales Manager can approve below-minimum pricing
- [ ] Warehouse and Accounts can view quotations read-only
- [ ] Purchase user cannot access `/sales/quotations`

## Quotation builder

- [ ] Create quotation for Sunrise Solar Dealers with module + inverter lines
- [ ] WP line total = qty × capacity × rate + GST
- [ ] Unit line total = qty × rate + GST
- [ ] Standard price pre-fills from product master
- [ ] Below-minimum rate shows warning and blocks send until approved
- [ ] Quotation number auto-generates (`ISE-QT-{FY}-{sequence}`)
- [ ] Validity shows 3 days from quotation date

## Send & PDF

- [ ] Save draft quotation remains in DRAFT status
- [ ] Send quotation moves to SENT after approvals
- [ ] PDF opens with customer, lines, totals, bank details, and terms
- [ ] Seeded sent quotation appears on dashboard Open Quotations count

## Revision & expiry

- [ ] Revise sent quotation creates new revision record (not overwrite)
- [ ] Revision history shows all versions
- [ ] Sent quotation past expiry moves to EXPIRED on list refresh

## Customer profile

- [ ] Customer quotations tab lists history
- [ ] New Quotation link pre-selects customer

## Tests

- [ ] `npm run test` passes quotation calculation and permission tests

## Audit

- [ ] Quotation create writes audit log
- [ ] Send and price approval write audit logs
