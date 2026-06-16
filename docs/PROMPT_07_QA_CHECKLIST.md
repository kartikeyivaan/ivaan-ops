# Prompt 07 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for proforma/payments migration
- [ ] Run `npm run db:seed` for sample PI and payments

## Permissions

- [ ] Sales Executive can create and view PIs
- [ ] Accounts can record payments but not create PIs
- [ ] Sales Manager can approve booking
- [ ] Purchase user cannot access `/sales/proforma-invoices`

## PI creation

- [ ] Convert sent quotation to PI from quotation detail
- [ ] Quotation status becomes CONVERTED
- [ ] Create direct PI from `/sales/proforma-invoices/new`
- [ ] PI number auto-generates (`ISE-PI-{FY}-{sequence}`)
- [ ] Issue draft PI moves to ISSUED status
- [ ] PI PDF opens with customer, lines, totals, bank details

## Payments

- [ ] Record payment against issued PI
- [ ] Outstanding = PI total − payments (BR-012)
- [ ] Payment cannot exceed outstanding balance
- [ ] Customer profile shows PI and payment history
- [ ] Customer outstanding metric updates after payment

## Booking

- [ ] Booking request blocked until 50% advance received
- [ ] Sales requests booking with warehouse selection
- [ ] PI moves to PENDING_BOOKING
- [ ] Sales Manager approves booking
- [ ] PI moves to BOOKED and inventory BOOK transaction created
- [ ] Seeded pending booking appears on dashboard Pending Approvals

## Dashboard

- [ ] Booked Orders count shows for sales roles
- [ ] Pending Payments count shows for admin/accounts

## Tests

- [ ] `npm run test` passes PI calculation and permission tests

## Audit

- [ ] PI create and issue write audit logs
- [ ] Payment and booking approval write audit logs
