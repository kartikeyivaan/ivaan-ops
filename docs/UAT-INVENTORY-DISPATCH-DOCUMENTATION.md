# Inventory, Dispatch, and Documentation UAT

Use a non-production database with the latest migration, opening-stock backfill,
active products, an active warehouse, and the seeded role users. Record **Pass**
or **Fail**, evidence, tester, and notes for every scenario.

## Roles and setup

- Super Admin: configuration, correction, and complete visibility.
- Purchase: incoming lots, arrival windows, and safety stock.
- Sales Executive: quotations, payments, booking requests, and timeline.
- Sales Manager: booking approval.
- Warehouse: dispatch execution.
- Accounts: invoice queue and invoice recording.
- Documentation Executive: assignment and DCR status.

Prepare one serialized product and one non-serialized product with known stock.
Configure working weekdays and one holiday. Create incoming lots with future
minimum and maximum dates, and verify opening-stock events have been backfilled.

## 1. Incoming stock and projection

1. Sign in as Purchase and create an incoming lot with an arrival range.
2. Open Projected Stock from Reports and select its warehouse and product.
3. Confirm the quantity appears on the expected maximum date, with the arrival
   range visible.
4. Change the range and confirm the projection changes.
5. Cancel the incoming event or lot through an authorised path.

Expected: draft/cancelled events do not affect availability; active incoming
stock, safety stock, and date windows are reflected without changing physical
stock. Result: **Pass / Fail**. Notes:

## 2. Delivery terms and booking eligibility

1. As Sales, create an Advance Booking quotation with a payment percentage and
   dispatch day range; convert it to a PI.
2. Record less than the required payment and request booking.
3. Record enough payment and request booking again.
4. As Sales Manager, approve the request.
5. Repeat with Ready Stock and verify payment below 100% is rejected.
6. Repeat with Subject to Availability and verify booking is rejected.
7. Verify a legacy quotation with no explicit booking permission is rejected.

Expected: PI terms take priority, quotation terms are the fallback, and only an
unconfigured non-legacy PI uses the historical 50% fallback. Manager approval
remains required. Result: **Pass / Fail**. Notes:

## 3. Reservation, shortage, and working dates

1. Note physical and projected stock before approval.
2. Approve a booking within projected availability.
3. Confirm one `BOOKING_RESERVATION` event exists per PI line.
4. Confirm physical stock is unchanged and projected availability is reduced.
5. Confirm PI minimum/maximum dispatch dates use configured working days and
   move past the configured holiday.
6. Attempt a booking that exceeds projected availability.
7. For a serialized item, confirm the expected serial count is marked booked.

Expected: the valid booking succeeds atomically; the shortage is clearly
reported and no partial reservation, transaction, or serial booking remains.
Result: **Pass / Fail**. Notes:

## 4. Dispatch completion

1. As Warehouse, create a dispatch for the booked PI.
2. Omit vehicle, receiver name, or receiver mobile and attempt confirmation.
3. Add all mandatory data and the exact serialized identifiers, then confirm.
4. Verify the DC, inventory transaction, actual dispatch event, PI dispatched
   quantity/status, and Accounts handover.
5. For a partial dispatch, repeat and confirm only remaining quantity is offered.

Expected: incomplete or duplicate serial data is blocked; confirmed dispatch
updates stock once and does not double-deduct projection. Result:
**Pass / Fail**. Notes:

## 5. Invoice handover

1. Sign in as Accounts and open Pending Invoice Entry from Reports.
2. Confirm the completed DC includes customer, vehicle, PI, and dispatch data.
3. Submit a blank invoice number, then a valid invoice number/date.
4. Refresh the queue and open Documentation.

Expected: blank invoice is rejected; valid entry is recorded once and creates
one documentation record for the dispatch. Result: **Pass / Fail**. Notes:

## 6. Documentation workflow

1. Assign the record to the Documentation Executive.
2. As that user, move it to HOLD without a reason, then with a reason.
3. Move it to FOR REVIEW without a reason, then with a reason.
4. Add remarks/internal notes and complete it as DCR ISSUED.
5. Review status and assignment history and Documentation Ageing / Status.

Expected: required reasons are enforced, assignment/status notifications are
created without duplicates per action, history is complete, and ageing stops at
completion. Result: **Pass / Fail**. Notes:

## 7. Permissions and notifications

1. Try each shortcut/API with an unauthorised role.
2. Verify Sales receives one booking confirmation and dispatch completion.
3. Verify active Accounts users receive one invoice-pending notification.
4. Verify an assignee receives assignment and third-party status updates.

Expected: server-side access is denied where appropriate and each business
event creates only its intended notifications. Result: **Pass / Fail**. Notes:

## 8. Regression and acceptance

Run `npm test` and `npx tsc --noEmit`. Smoke-test existing quotation pricing,
PI manager approval, inventory ledger, and dispatch cancellation. No Service,
Proposal, or pricing behaviour may change.

Final result: **Pass / Fail**  
Tester/date:  
Blocking defects:  
Evidence links:
