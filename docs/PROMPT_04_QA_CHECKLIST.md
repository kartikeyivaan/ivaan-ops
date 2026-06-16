# Prompt 04 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for inventory migration
- [ ] Run `npm run db:seed` for vendor and sample incoming lot

## Permissions

- [ ] Sales Executive can view stock but not serial numbers on inward API
- [ ] Purchase can create incoming lots
- [ ] Warehouse can receive material and report damage
- [ ] Super Admin can adjust non-serial stock
- [ ] Accounts can view inventory read-only

## Incoming & inwarding

- [ ] Purchase creates incoming lot for a product
- [ ] Lot number auto-generates (`LOT-{FY}-{sequence}`)
- [ ] Warehouse receives partial quantity against lot
- [ ] Pending incoming reduces after partial receipt
- [ ] Serial-tracked product requires serial list matching received qty
- [ ] Duplicate serial numbers are rejected
- [ ] Damaged qty can be recorded during inwarding
- [ ] Lot closes when received + damaged equals expected qty

## Stock views

- [ ] Inventory home shows consolidated Available/Incoming/Booked/Damaged
- [ ] Warehouse columns show split (e.g. Jalgaon HO / Jalgaon Projects)
- [ ] Product list shows live stock instead of zero placeholders
- [ ] Search by product name works on stock overview

## Ledger & damage

- [ ] INWARD transactions appear in ledger
- [ ] DAMAGE transactions appear in ledger
- [ ] Negative stock actions are blocked

## Mobile inwarding

- [ ] Inward screen uses large touch-friendly inputs on phone viewport

## Tests

- [ ] `npm run test` passes inventory helper and permission tests

## Audit

- [ ] Incoming lot create writes audit log
- [ ] Inward update writes audit log
