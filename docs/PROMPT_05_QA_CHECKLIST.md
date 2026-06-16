# Prompt 05 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for transfers migration
- [ ] Run `npm run db:seed` for available stock and sample serials

## Permissions

- [ ] Sales Executive can view transfers but not serial numbers
- [ ] Warehouse can create, dispatch, and receive transfers
- [ ] Super Admin can cancel draft transfers
- [ ] Accounts can view transfers read-only

## Inter-warehouse transfer

- [ ] Warehouse creates draft from Jalgaon HO to Jalgaon Projects (ISE)
- [ ] Transfer number auto-generates (`TRF-{FY}-{sequence}`)
- [ ] Dispatch reduces available stock at source warehouse
- [ ] Receive at destination increases stock
- [ ] Partial receive works for non-serial products (cable)
- [ ] Serial-tracked lines require full receive

## Inter-company transfer

- [ ] Draft can target PCMV Jalgaon HO from ISE (admin user)
- [ ] Dispatch from ISE deducts ISE stock
- [ ] Switch company to PCMV and receive incoming transfer
- [ ] Serials appear at PCMV destination after receive

## Ledger & validation

- [ ] TRANSFER transactions appear in ledger on dispatch and receive
- [ ] Insufficient stock blocked on create and dispatch
- [ ] Same source/destination warehouse rejected

## UI

- [ ] Transfers link visible from inventory overview
- [ ] Incoming / outgoing filters work on transfer list
- [ ] Receive form uses large touch-friendly inputs

## Tests

- [ ] `npm run test` passes transfer permission tests

## Audit

- [ ] Transfer create writes audit log
- [ ] Dispatch and receive write audit logs
- [ ] Cancel draft writes audit log
