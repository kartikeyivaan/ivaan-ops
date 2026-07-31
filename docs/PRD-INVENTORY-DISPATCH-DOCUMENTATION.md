# Ivaan Ops — Inventory Intelligence, Quotation, Dispatch & Documentation PRD

**Document Type:** Product Requirements Document  
**Project:** Ivaan Ops  
**Status:** Ready for Implementation  
**Scope:** Remaining features only  
**Excluded as already completed:** Service Module, Proposal fixes  
**Primary Users:** Super Admin, Admin, Purchase Manager, Sales Manager, Sales Executive, Warehouse/Dispatch Executive, Accounts, Documentation Executive

---

## 1. Purpose

This PRD defines the remaining changes required in Ivaan Ops to connect purchase planning, future inventory visibility, quotation delivery terms, stock booking, dispatch execution, invoicing handover and post-invoice DCR documentation.

The implementation must create one connected operational flow:

Purchase Planning → Projected Inventory → Quotation → Payment → Booking → Dispatch → Invoice → Documentation → Completion

The objective is to ensure Sales can commit realistic delivery dates, inventory is not overbooked, Purchase can communicate arrival windows, Dispatch records complete execution data, Accounts receives invoice inputs, and Documentation can complete DCR certificate work.

---

## 2. Goals

1. Build a future inventory engine using current stock, incoming lots, reservations, dispatches and safety stock.
2. Show Sales a 15-day projected stock timeline.
3. Store delivery and booking terms in Quotations and carry them forward into PI, Booking and Dispatch.
4. Prevent stock booking when quotation terms do not permit booking.
5. Add non-blocking warnings for PCM non-module quotations and cross-company stock availability.
6. Make dispatch information complete and operationally reliable.
7. Create a post-invoice Documentation workflow for DCR certificates.
8. Preserve the existing design system, permissions model and mobile responsiveness.

---

## 3. Non-Goals

The following are outside this implementation:

- Service Module
- Proposal PDF naming fixes
- Default inverter capacity fixes
- Automatic Tally invoice generation
- Government portal integration
- Supplier portal integration
- Advanced demand forecasting using machine learning
- Customer master integration for Service
- Public customer tracking portal

---

## 4. Key Definitions

### 4.1 Physical Stock
Quantity physically available in a warehouse.

### 4.2 Reserved Stock
Quantity allocated to approved customer bookings but not yet dispatched.

### 4.3 Incoming Lot
Material expected from a supplier or another warehouse.

### 4.4 Planned Dispatch
Material expected to leave inventory on a future date.

### 4.5 Safety Stock
Minimum quantity protected from normal sales commitments.

### 4.6 Net Available Today
Physical Stock − Active Reservations − Safety Stock

### 4.7 Projected Available Quantity
Projected stock on a date after applying all inventory events up to that date.

### 4.8 Arrival Window
Expected minimum and maximum arrival date for an incoming lot.

### 4.9 Booking
Reservation of stock after the required payment condition is satisfied.

---

# 5. Roles and Permissions

## 5.1 Super Admin
- Full access to all companies and warehouses.
- Manage safety stock.
- Override projected dates.
- Override SKU-level rules.
- View and edit all bookings, dispatches and documentation records.
- Configure working days and holidays.

## 5.2 Admin
- Manage inventory settings.
- View all company and warehouse inventory.
- Update safety stock where permitted.
- Access dispatch and documentation records.
- Correct operational data with audit logging.

## 5.3 Purchase Manager
- Create and update incoming purchase lots.
- Record expected minimum and maximum arrival dates.
- Update supplier and quantity information.
- Override safety stock per SKU where allowed.
- View projected demand and inventory.

## 5.4 Sales Manager
- View all quotations and bookings.
- View projected inventory.
- Review booking and dispatch commitments.
- Resolve stock allocation conflicts.
- View cross-company stock warnings.

## 5.5 Sales Executive
- Create quotations.
- Select payment and delivery terms.
- Record customer payment information.
- Trigger booking when terms are satisfied.
- View sales inventory timeline.
- View only permitted companies and warehouses.

## 5.6 Warehouse / Dispatch Executive
- View approved dispatches.
- Enter serial numbers.
- Record receiver details.
- Record vehicle number.
- Capture optional receiver signature.
- Generate or update Delivery Challan.
- Complete dispatch.

## 5.7 Accounts
- View completed Delivery Challans.
- View receiver, vehicle and serial number information.
- Enter Tally invoice number manually.
- Mark invoice information as recorded.

## 5.8 Documentation Executive
- View post-invoice documentation work.
- Receive invoice number, Delivery Challan and serial numbers.
- Update DCR status.
- Record review, hold, remarks and internal notes.
- Complete records as DCR Issued or Not Required.

---

# 6. End-to-End Workflow

1. Purchase Manager creates an incoming lot.
2. Purchase Manager records expected arrival minimum and maximum dates.
3. Future inventory engine creates an incoming inventory event.
4. Sales Executive views projected stock by date.
5. Sales Executive creates quotation and selects delivery/payment terms.
6. System validates whether booking is allowed.
7. Sales Executive records payment received.
8. If payment condition is satisfied, booking reserves stock.
9. Reservation appears in the future inventory timeline.
10. Dispatch is planned according to quotation terms and stock availability.
11. Dispatch Executive records mandatory execution details.
12. Delivery Challan is completed.
13. Accounts receives dispatch details and enters invoice number.
14. Documentation record is created or activated.
15. Documentation Executive completes DCR certificate work.
16. Record is completed when status becomes DCR Issued or Not Required.

---

# 7. Functional Requirements

# Module A — Future Inventory Engine

## A1. Inventory Event Architecture

The system must represent future inventory through event records.

### Required event types
- OPENING_STOCK
- MANUAL_ADJUSTMENT_IN
- MANUAL_ADJUSTMENT_OUT
- PURCHASE_INCOMING
- STOCK_TRANSFER_IN
- STOCK_TRANSFER_OUT
- BOOKING_RESERVATION
- BOOKING_RELEASE
- PLANNED_DISPATCH
- ACTUAL_DISPATCH
- RETURN_IN
- RETURN_OUT

### Required event fields
- event_id
- company_id
- warehouse_id
- product_id
- sku_id
- event_type
- quantity
- quantity_effect
- effective_date
- expected_min_date
- expected_max_date
- source_type
- source_id
- source_number
- status
- notes
- created_by
- created_at
- updated_by
- updated_at
- cancelled_at
- cancellation_reason

### Quantity effect
Use a consistent signed quantity model:
- Positive for stock increases.
- Negative for stock decreases.

### Event status
- DRAFT
- ACTIVE
- COMPLETED
- CANCELLED

Only ACTIVE and COMPLETED events should affect projections unless otherwise specified.

---

## A2. Inventory Projection Calculation

For a selected company, warehouse and SKU:

Projected Available on Date D = Physical Stock  
+ Confirmed Incoming Qty up to D  
+ Transfer In Qty up to D  
− Active Reservation Qty up to D  
− Planned Dispatch Qty up to D  
− Transfer Out Qty up to D  
− Safety Stock

### Rules
1. Cancelled events do not affect projections.
2. Draft incoming lots do not affect projections.
3. Completed actual dispatch replaces its planned dispatch effect and must not double-deduct stock.
4. Booking release reverses the reservation.
5. Actual stock adjustment changes physical stock and projected stock.
6. Projection calculations must be deterministic and reusable by all modules.
7. Calculations must use transaction-safe updates.

---

## A3. Arrival Window Treatment

Incoming lots use:
- expected_min_date
- expected_max_date

### Projection logic
For quantity calculations, the incoming quantity becomes available on expected_max_date.

### Display logic
The timeline displays a bar spanning expected_min_date through expected_max_date.

### Rationale
The UI communicates the full expected window, while stock commitment remains conservative.

---

## A4. Safety Stock

### Default
100 units per SKU.

### Rules
- Safety stock must be configurable per company, warehouse and SKU.
- Purchase Manager and Admin can override it.
- Super Admin can override all values.
- A global default of 100 applies only when no SKU-specific setting exists.
- Sales availability must exclude safety stock.
- Admin inventory views may show physical stock separately from sales-available stock.
- Safety stock changes must be audit logged.

### Suggested data model
`inventory_safety_stock`
- id
- company_id
- warehouse_id
- sku_id
- safety_qty
- effective_from
- is_active
- created_by
- updated_by
- timestamps

---

## A5. Working Day Logic

If a calculated dispatch date falls on a non-working day, shift it to the next working day.

### Configuration
- Company-level weekly working days.
- Company-level holiday calendar.
- Optional warehouse-specific override.

### Default assumption
Sunday is non-working unless existing configuration states otherwise.

### Required helper
`getNextWorkingDate(companyId, warehouseId, proposedDate)`

---

## A6. Audit Trail

All changes affecting projected inventory must create an audit record containing:
- entity
- entity_id
- field changed
- old value
- new value
- user
- timestamp
- reason, where applicable

---

# Module B — Purchase Incoming Lots

## B1. Purchase Lot Form

Add or confirm these fields:
- Company
- Warehouse
- Supplier
- Product / SKU
- Quantity
- Expected Arrival Min Date
- Expected Arrival Max Date
- Status
- Reference Number
- Remarks

### Validation
- Quantity must be greater than zero.
- Min date cannot be after max date.
- Warehouse must belong to selected company.
- SKU must be active.
- Completed or cancelled lots cannot be silently edited.
- Material changes to an active lot require audit history.

---

## B2. Purchase Lot Statuses

- DRAFT
- ORDERED
- IN_TRANSIT
- PARTIALLY_RECEIVED
- RECEIVED
- DELAYED
- CANCELLED

### Projection behaviour
- ORDERED, IN_TRANSIT, PARTIALLY_RECEIVED and DELAYED affect projections.
- DRAFT and CANCELLED do not.
- RECEIVED quantity must move into physical stock.
- Partially received lots must split received and pending quantities correctly.

---

## B3. Delay Handling

If max arrival date passes and lot is not received:
- Mark or suggest status DELAYED.
- Keep the lot visible in the timeline.
- Display a delayed indicator.
- Purchase Manager can revise the date window.
- Revised dates update projections and log history.

---

# Module C — Booking Engine

## C1. Booking Eligibility

Booking is allowed only when:
1. Quotation or PI permits booking.
2. Required payment condition is met.
3. Sufficient projected stock is available for the required dispatch window.
4. Booking quantity is valid.
5. SKU, company and warehouse are active.

---

## C2. Booking Quantity

A booking creates a BOOKING_RESERVATION event.

It does not reduce physical stock.

### Booking fields
- booking_id
- quotation_id
- pi_id, if available
- company_id
- warehouse_id
- customer_id or quotation customer reference
- sales_executive_id
- booking_date
- required_dispatch_min_date
- required_dispatch_max_date
- payment_term_type
- required_payment_percent
- amount_received
- payment_percent_received
- status
- remarks

### Booking line fields
- booking_line_id
- booking_id
- sku_id
- quantity
- reservation_event_id
- planned_dispatch_date
- status

---

## C3. Booking Statuses

- DRAFT
- ACTIVE
- PARTIALLY_DISPATCHED
- FULLY_DISPATCHED
- RELEASED
- CANCELLED

### Rules
- ACTIVE bookings reserve stock.
- RELEASED and CANCELLED bookings must release remaining reservation.
- Partial dispatch reduces only the remaining reserved quantity.
- One PI may have multiple dispatches.

---

## C4. Payment Recording

Sales Executive records:
- Payment date
- Amount received
- Payment reference
- Payment mode
- Attachment, if existing file support is available
- Remarks

No separate approval is required for booking, unless existing permissions require otherwise.

### Validation
- Booking should activate only after the required payment percentage is met.
- A user may save incomplete payment information as draft.
- Payment correction must be audited.

---

## C5. Stock Conflict Handling

When sufficient projected quantity is not available:
- Do not silently overbook.
- Display shortage quantity.
- Show earliest projected date when required quantity becomes available.
- Allow Sales Manager/Admin override only if an explicit override permission exists.
- Override requires reason and audit trail.

---

# Module D — Sales Executive Inventory Timeline

## D1. Page Purpose

Provide a simple sales-facing view of future stock availability without exposing unnecessary purchase or cost details.

---

## D2. Filters

Required:
- Company
- Warehouse
- Product / SKU

Optional:
- Brand
- Category

### Combined company view
Where permission allows, user can choose:
- Individual company
- Combined view

Combined view must show totals and identify company-level availability in details.

---

## D3. Timeline Range

- Default: 15 calendar days from today.
- Horizontal scrolling.
- Today must be visually identifiable.
- Dates should use local timezone.
- Future extension may be supported, but is not required in this sprint.

---

## D4. Collapsed Card

Each selected SKU displays one expandable card.

Collapsed card shows:
- SKU name
- Available Today
- Safety Stock
- Net Sales-Available Today
- Timeline stock level by date

Do not show supplier, customer or document detail in collapsed view.

---

## D5. Expanded Card

Expanded view shows daily events:
- Incoming purchase
- Booking reservation
- Planned dispatch
- Transfer in
- Transfer out
- Manual adjustment

Each event detail may show:
- Quantity
- Company
- Warehouse
- Source type
- Source number
- Expected window
- Status

Respect role-based visibility for customer and supplier names.

---

## D6. Arrival Window Bar

Incoming lots must show a green bar from expected minimum date to expected maximum date.

The bar:
- Spans all dates in the range.
- Shows total incoming quantity.
- Opens details on click or tap.
- Must work on mobile without hover dependency.

---

## D7. Date Interaction

Default display:
- Date
- Projected stock level

On hover, click or tap:
- Opening projected quantity
- Incoming quantity
- Reserved quantity
- Planned dispatch quantity
- Closing projected quantity
- Event list

---

## D8. Summary Metrics

Top summary area:
- Physical Stock
- Reserved Qty
- Incoming Qty within 15 days
- Safety Stock
- Net Available Today

Use total quantity only. Do not display monetary values.

---

## D9. Performance

- Initial page load should avoid loading all SKUs.
- Projection should run only for selected filters.
- Use server-side aggregation where appropriate.
- Cache projection results briefly if needed, but invalidate after inventory-affecting changes.
- Avoid N+1 queries.

---

# Module E — Quotation Delivery Terms

## E1. Delivery Term Modes

### Mode 1 — Advance Booking
Editable fields:
- Required advance percentage
- Dispatch minimum days after booking
- Dispatch maximum days after booking

Suggested quotation note:
“{Y}% advance payment is required for booking. Delivery is expected within {X1}–{X2} days from booking confirmation.”

### Mode 2 — Ready Stock
Fixed payment:
- 100% payment required for booking.

Suggested quotation note:
“100% payment is required for booking. The item is offered from ready stock and remains subject to availability until booking confirmation.”

### Mode 3 — Dispatch Subject to Availability
Default mode.

Suggested quotation note:
“Dispatch is subject to material availability.”

Rules:
- Booking not allowed.
- No stock reservation.
- Dispatch may be planned only when stock becomes available.

---

## E2. Default Selection

Default must be:
- No delivery term selected, or
- Mode 3 represented as the default blank state according to current UI behaviour.

The final quotation must include:
“Dispatch is subject to material availability.”

Booking must remain disabled.

---

## E3. Required Stored Fields

At quotation header level:
- delivery_term_mode
- booking_allowed
- required_payment_percent
- dispatch_min_days
- dispatch_max_days
- delivery_term_note_snapshot

Store a note snapshot so historical documents remain unchanged even if templates are updated.

---

## E4. Downstream Reuse

The selected terms must carry forward into:
- Quotation PDF
- PI
- Payment screen
- Booking
- Dispatch planning
- Projected inventory

Do not ask users to re-enter the same terms.

---

## E5. Dispatch Date Calculation

For booking-enabled modes:

Booking Confirmation Date + Min Days = Earliest Dispatch Date  
Booking Confirmation Date + Max Days = Latest Dispatch Date

Apply working-day adjustment to each calculated date.

Ready Stock:
- Eligible for same-day dispatch when full payment is received before the configured cut-off.
- If after cut-off, shift to the next working day.

### Cut-off
Create a configurable company-level dispatch cut-off time.

If no setting exists, preserve existing system behaviour and avoid hard-coding without approval.

---

# Module F — Quotation Warnings

## F1. PCM Non-Module Warning

Trigger:
- Selected quotation company is PCM.
- At least one selected item is not in the Modules category.

Timing:
- Before saving quotation.
- Also visible while editing if practical.

Behaviour:
- Warning only.
- Do not block save.
- User can proceed.

Suggested text:
“PCM primarily handles module sales. This quotation includes non-module items. Please verify the selected company, pricing and stock before saving.”

---

## F2. Cross-Company Stock Warning

Trigger:
- Another permitted company has higher sales-available stock for a selected SKU than the quotation company.

Behaviour:
- Warning only.
- Do not automatically change company.
- Do not block save.

Suggested text:
“Higher available stock for one or more selected items exists in another company. Review company-wise availability before finalising the quotation.”

### Details panel
Show:
- SKU
- Selected company availability
- Other company availability

Do not expose unauthorised companies.

---

## F3. Warning Acceptance

Store:
- Warning type
- Whether displayed
- User who proceeded
- Timestamp

This is for audit and UX analysis, not approval.

---

# Module G — Dispatch

## G1. Dispatch Preconditions

Dispatch may proceed only when:
- Booking or order permits dispatch.
- Quantity does not exceed remaining dispatchable quantity.
- Mandatory dispatch information is complete.
- Required serial numbers are recorded for serialized products.

---

## G2. Mandatory Dispatch Fields

For Warehouse/Dispatch and Delivery Challan completion:
- Receiver Name
- Receiver Mobile Number
- Vehicle Number
- Serial Numbers, where applicable

These may remain optional for Sales Executive during planning but must be completed before final dispatch.

---

## G3. Serial Number Capture

Support:
- Manual entry
- Paste multiple values
- Barcode/QR scan if current app infrastructure already supports camera scanning
- Duplicate detection
- Quantity match validation

Rules:
- Serial number count must match dispatched quantity for serialized SKUs.
- Duplicate serials across completed dispatches must be rejected.
- Corrections after dispatch require authorised role and audit trail.

---

## G4. Receiver Signature

Optional feature:
- Signature pad usable on mobile touchscreen.
- Clear and re-sign actions.
- Save signature image securely.
- Associate with dispatch and Delivery Challan.
- Do not make signature mandatory.

---

## G5. Partial Dispatch

One PI or booking may have multiple dispatches.

System must track:
- Ordered Qty
- Booked Qty
- Previously Dispatched Qty
- Current Dispatch Qty
- Remaining Qty

Each partial dispatch creates its own:
- Dispatch record
- Delivery Challan
- Serial number list
- Receiver details

---

## G6. Delivery Challan

Delivery Challan must contain or reference:
- DC number
- Date
- Company
- Customer
- Delivery address
- Product lines
- Quantity
- Serial numbers
- Receiver name
- Receiver mobile
- Vehicle number
- Optional receiver signature
- Dispatch executive
- Booking / PI reference

---

## G7. Inventory Effect

Before completion:
- Planned dispatch event affects future projection.

On completion:
- Actual dispatch reduces physical stock.
- Related reservation decreases.
- Planned dispatch is closed or replaced.
- No double deduction.

---

# Module H — Accounts Handover

## H1. Accounts Queue

Accounts sees completed dispatches requiring invoice entry.

Display:
- Customer
- Company
- Delivery Challan number
- Dispatch date
- Product and quantity
- Serial numbers
- Receiver details
- Vehicle number
- PI reference
- Invoice status

---

## H2. Manual Invoice Number

Accounts enters:
- Invoice number
- Invoice date
- Optional remarks
- Optional attachment if supported

Invoice is generated in Tally outside Ivaan Ops.

### Status
- PENDING_INVOICE
- INVOICE_RECORDED
- CORRECTION_REQUIRED

---

## H3. Documentation Trigger

When invoice number is recorded:
- Create or activate Documentation record.
- Pass invoice number, DC information, serial numbers and customer details.
- Avoid duplicate Documentation records.

---

# Module I — Documentation / DCR

## I1. Purpose

Track post-invoice DCR certificate work completed on the government portal.

No government portal API integration is required.

---

## I2. Record Creation

Documentation record is created when:
- Invoice number is recorded, or
- Authorised user manually creates it for a valid invoiced dispatch.

---

## I3. Basic Details

Display:
- Documentation ID
- Company
- Customer
- Invoice Number
- Invoice Date
- Delivery Challan Number
- Dispatch Date
- Product / SKU
- Quantity
- Serial Numbers
- Documentation Executive
- Assigned Date
- Completed Date
- Ageing in Days

Do not add a separate “DCR Details” subsection.

---

## I4. Statuses

- PENDING — default
- HOLD
- FOR_REVIEW
- DCR_ISSUED
- NOT_REQUIRED

### Completion logic
Completed when:
- DCR_ISSUED, or
- NOT_REQUIRED

### Incomplete statuses
- PENDING
- HOLD
- FOR_REVIEW

---

## I5. Conditional Fields

### HOLD
Require:
- Hold Reason

### FOR_REVIEW
Require:
- Review Reason

### DCR_ISSUED
Set:
- Completed Date
- Completed By

### NOT_REQUIRED
Set:
- Completed Date
- Completed By

---

## I6. Additional Fields

- Remarks
- Internal Notes
- Review Reason
- Hold Reason

Internal Notes must not appear on customer-facing documents.

---

## I7. Ageing

Ageing = Current Date − Assigned Date

For completed records:
Ageing = Completed Date − Assigned Date

Display ageing in days.

---

## I8. Assignment

Allowed roles can:
- Assign Documentation Executive.
- Reassign with history.
- Set Assigned Date automatically on first assignment.
- Preserve reassignment audit trail.

---

# 8. Data Model Summary

The implementation should add or adapt entities similar to:

- inventory_events
- inventory_safety_stock
- purchase_incoming_lots
- company_working_days
- company_holidays
- quotation_delivery_terms
- quotation_warnings_log
- bookings
- booking_lines
- payment_records
- dispatches
- dispatch_lines
- dispatch_serial_numbers
- receiver_signatures
- invoice_handover
- documentation_records
- documentation_status_history
- audit_logs

Use existing naming conventions and ORM patterns. Do not duplicate entities that already exist; extend them safely.

---

# 9. API Requirements

Suggested endpoints or server actions:

## Inventory
- GET projected inventory
- GET inventory events
- POST/PUT safety stock
- GET earliest availability date

## Purchase
- POST incoming lot
- PUT incoming lot
- POST partial receipt
- POST full receipt
- POST revise arrival window

## Quotation
- PUT delivery terms
- POST validate warnings
- POST confirm save with warnings

## Booking
- POST payment record
- POST create booking
- POST release booking
- GET booking availability check

## Dispatch
- POST create planned dispatch
- PUT dispatch details
- POST serial numbers
- POST receiver signature
- POST complete dispatch

## Accounts
- GET invoice queue
- POST invoice number
- POST invoice correction

## Documentation
- GET documentation queue
- PUT assignment
- PUT status
- PUT remarks/internal notes

All write operations must enforce role permissions server-side.

---

# 10. UI / UX Requirements

1. Match the existing Ivaan Ops visual style.
2. Mobile responsive.
3. Use cards and expandable sections.
4. Avoid exposing excessive operational detail to Sales.
5. Use click/tap interactions; do not rely only on hover.
6. Show clear empty states.
7. Show loading and error states.
8. Confirm destructive actions.
9. Use badges for statuses.
10. Keep forms short and progressive where possible.
11. Preserve existing keyboard navigation and accessibility patterns.
12. Avoid hard-coded colours if a design token exists.

---

# 11. Validation Rules

- Min arrival date ≤ Max arrival date.
- Dispatch min days ≤ Dispatch max days.
- Required advance percentage must be between 0 and 100.
- Ready Stock requires 100% payment.
- Booking-disabled quotations cannot create reservations.
- Reservation quantity cannot exceed permitted availability without authorised override.
- Dispatch quantity cannot exceed remaining booked quantity.
- Serial count must match serialized quantity.
- Duplicate serial numbers are invalid.
- Invoice number cannot be blank when marking invoice recorded.
- Hold reason required for HOLD.
- Review reason required for FOR_REVIEW.
- Completed date auto-set for DCR_ISSUED and NOT_REQUIRED.

---

# 12. Notifications

Use existing notification infrastructure where available.

Suggested notifications:
- Incoming lot delayed.
- Booking created.
- Booking shortage or conflict.
- Dispatch ready for warehouse.
- Dispatch completed.
- Invoice entry pending.
- Documentation assigned.
- Documentation placed on hold.
- Documentation sent for review.
- Documentation completed.

Do not introduce external messaging integrations in this scope.

---

# 13. Reporting

Minimum operational reports:
- Projected Stock by SKU
- Incoming Lots by Arrival Window
- Booked vs Available Qty
- Upcoming Dispatches
- Delayed Incoming Lots
- Pending Invoice Entry
- Documentation Ageing
- Documentation Status Summary

Exports should follow existing Excel export patterns if available.

---

# 14. Migration and Backfill

1. Inspect existing quotation, PI, stock, booking and dispatch tables.
2. Create additive migrations.
3. Do not delete historical columns during initial rollout.
4. Backfill quotation delivery terms:
   - Existing quotations remain legacy.
   - Set booking_allowed according to existing data only when safely inferable.
   - Otherwise mark as LEGACY/UNKNOWN and avoid automatic booking.
5. Create opening inventory event snapshots from current warehouse stock.
6. Reconcile totals before enabling projection in production.
7. Add feature flags for major modules if the app supports them.

---

# 15. Security and Data Integrity

- Enforce company and warehouse scoping.
- Enforce role permissions server-side.
- Prevent client-side quantity tampering.
- Use database transactions for booking, release and dispatch completion.
- Prevent duplicate documentation creation.
- Prevent serial number reuse.
- Audit overrides.
- Validate file uploads and signature images.
- Never expose internal notes on customer-facing output.

---

# 16. Acceptance Criteria

## Inventory Engine
- Projected stock correctly changes after incoming lot, booking, release and dispatch.
- Safety stock is excluded from Sales availability.
- Arrival range displays correctly.
- Cancelled events do not affect projection.
- Actual dispatch does not double-deduct stock.

## Purchase
- Purchase Manager can save min/max dates.
- Delayed lots remain visible and editable with history.
- Partial receipts correctly update pending quantity.

## Timeline
- 15-day horizontal timeline works on desktop and mobile.
- Collapsed view shows date and stock only.
- Expanded view shows event details.
- Arrival bar spans the full min/max range.
- Combined company view respects permissions.

## Quotation
- Default state prevents booking.
- Terms are saved and carried to PI and booking.
- PCM warning triggers correctly.
- Cross-company warning triggers correctly.
- Warnings never block save.

## Booking
- Payment condition controls booking.
- Reservation reduces projected availability but not physical stock.
- Partial dispatch retains remaining reservation.
- Release restores availability.

## Dispatch
- Mandatory receiver, mobile, vehicle and serial fields are enforced.
- Partial dispatch works.
- Signature works on mobile and remains optional.
- Delivery Challan reflects dispatch data.

## Accounts
- Completed dispatch appears in invoice queue.
- Invoice number can be recorded manually.
- Documentation record is created once.

## Documentation
- Default status is Pending.
- Hold and Review reasons are mandatory when applicable.
- DCR Issued and Not Required complete the record.
- Ageing is calculated correctly.
- No separate DCR Details section is shown.

---

# 17. Test Scenarios

1. Ready stock with payment before cut-off.
2. Ready stock with payment after cut-off.
3. Advance booking with dispatch range.
4. Default “subject to availability” quotation.
5. Incoming lot with 5–8 Aug arrival window.
6. Purchase lot delayed beyond max date.
7. Safety stock override from 100 to another value.
8. Booking exactly equal to available stock.
9. Booking exceeding available stock.
10. Booking release.
11. Partial dispatch.
12. Multiple dispatches against one PI.
13. Duplicate serial entry.
14. Dispatch completion and physical stock reduction.
15. Invoice number entry.
16. Documentation status Hold.
17. Documentation status For Review.
18. DCR Issued completion.
19. Not Required completion.
20. Cross-company stock warning.
21. PCM non-module warning.
22. Permission check between roles.
23. Working-day date shift.
24. Cancelled incoming lot.
25. Partial purchase receipt.

---

# 18. Recommended Implementation Order

## Sprint 1 — Discovery and Schema
- Inspect current models and flows.
- Finalise mappings.
- Add migrations.
- Add audit support.

## Sprint 2 — Inventory and Purchase
- Inventory event service.
- Projection engine.
- Safety stock.
- Incoming lots and arrival windows.
- Working-day helper.

## Sprint 3 — Quotation and Booking
- Delivery term modes.
- Payment capture.
- Booking eligibility.
- Reservation events.
- Warning engine.

## Sprint 4 — Sales Timeline
- Filters.
- Summary metrics.
- 15-day timeline.
- Expandable details.
- Arrival window bars.

## Sprint 5 — Dispatch and Accounts
- Planned dispatch.
- Mandatory dispatch fields.
- Serial capture.
- Partial dispatch.
- Optional signature.
- Invoice queue.

## Sprint 6 — Documentation
- Documentation role.
- Queue and record screen.
- Status workflow.
- Ageing.
- Assignment and audit.

## Sprint 7 — QA and Rollout
- Automated tests.
- Migration reconciliation.
- Permission tests.
- Regression testing.
- Feature rollout.

---

# 19. Definition of Done

The scope is complete when:
- All acceptance criteria pass.
- Database migrations succeed on clean and existing environments.
- Tests cover projection, booking, dispatch and documentation.
- Role permissions are verified.
- Existing quotation, PI and inventory flows still work.
- Mobile UI is usable.
- No duplicate stock deduction occurs.
- Audit logs exist for sensitive changes.
- Production rollout instructions are documented.
