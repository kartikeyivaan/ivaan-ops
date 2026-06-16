# Prompt 08 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for dispatches migration
- [ ] Run `npm run db:seed` for booked PI and sample DC

## Permissions

- [ ] Warehouse can create and confirm dispatches
- [ ] Sales Executive can view dispatches but not create
- [ ] Sales Manager can approve DC cancellation
- [ ] Purchase user cannot access `/inventory/dispatches`

## Dispatch creation

- [ ] Bookable PI list shows BOOKED / PARTIALLY_DISPATCHED orders only
- [ ] Partial qty dispatch reduces remaining booked qty
- [ ] Serial scan adds booked serial to dispatch line
- [ ] Invalid serial rejected (wrong PI, not booked, wrong product)
- [ ] DC number auto-generates (`ISE-DC-{FY}-{sequence}`)
- [ ] PI status becomes PARTIALLY_DISPATCHED or FULLY_DISPATCHED

## Inventory

- [ ] Serial status changes BOOKED → DISPATCHED on confirm
- [ ] DISPATCH inventory transaction created
- [ ] Non-serial products deduct lot stock on dispatch

## DC PDF

- [ ] PDF opens with customer, PI, warehouse, lines, serials

## Cancel flow

- [ ] Warehouse can request cancel on dispatched DC
- [ ] Manager approves cancel — serials return to BOOKED
- [ ] PI dispatched qty reduced after cancel approval

## Customer profile

- [ ] Dispatches tab lists customer DC history
- [ ] Dispatch This Year metric updates after dispatch

## Dashboard

- [ ] Warehouse Today's Dispatches count shows
- [ ] Manager Pending Approvals includes DC cancels

## Tests

- [ ] `npm run test` passes dispatch helper and permission tests

## Audit

- [ ] Dispatch create, confirm, and cancel write audit logs
