# Sales Dashboard — Mandatory Data Audit

**Date:** 20 August 2026  
**Codebase:** IvaanWebOps (`ivaan-ops`)  
**PRD:** `docs/IVAAN_OPS_SALES_DASHBOARD_PRD.md`  
**Purpose:** Map every dashboard metric to actual models, fields, statuses, formulas, and ownership rules before implementation.

---

## Audit Conventions

| Term | Meaning in this document |
|---|---|
| **Authoritative report** | `getSalesExecutiveReport()` in `src/lib/report-service.ts` — baseline for KPI value metrics |
| **Company scope** | All queries filter `companyId` from active session (`requireActiveCompany`) |
| **Date parsing** | `parseReportDate()` / `endOfReportDay()` in `src/lib/reports.ts` use UTC midnight/end-of-day (`T00:00:00.000Z` / `T23:59:59.999Z`) |
| **Date-only storage** | Many business dates are `@db.Date` columns compared via `toDateOnly()` in `src/lib/dispatches.ts` / `src/lib/quotations.ts` |

**Important:** The codebase does **not** currently implement `Asia/Kolkata` timezone utilities. All date behaviour documented below reflects **existing code**, not the PRD target state.

---

## 1. Executive / Customer Ownership Attribution

### 1.1 Authoritative dispatch attribution rule

**Rule (confirmed from `getSalesExecutiveReport` and `getDispatchReport`):**

> A dispatch is attributed to the Sales Executive recorded on the **parent Proforma Invoice** (`proforma_invoices.sales_user_id`), **not** the dispatch creator (`dispatches.created_by`).

```typescript
// src/lib/report-service.ts — dispatched value query
prisma.dispatch.findMany({
  where: {
    companyId,
    status: DispatchStatus.DISPATCHED,
    proformaInvoice: { salesUserId: user.id },
    dispatchDate: { gte: fromDate, lte: toDate }, // when filters present
  },
  // ...
});
```

| Entity | Ownership field | Set when | Used for performance |
|---|---|---|---|
| `Customer` | `assigned_sales_user_id` | Customer create/edit/import | New Customers metric; customer list filter; **not** used in Sales Executive Report KPIs |
| `Quotation` | `sales_user_id` | Create (defaults to session user) or explicit on create | Quotation Value |
| `ProformaInvoice` | `sales_user_id` | PI create; copied from quotation on convert | PI Value; dispatch/collection attribution |
| `Payment` | *(none on payment)* | — | Attributed via `payment → proformaInvoice.salesUserId` |
| `Dispatch` | `created_by`, `dispatched_by` | Dispatch workflow | **Not** used for sales performance reports |

### 1.2 Reassignment behaviour

- **Customer reassignment:** `Customer.assignedSalesUserId` can be updated via `/api/customers/reassign` (Super Admin / Sales Manager). Historical quotations, PIs, payments, and dispatches **retain their original `salesUserId`** — they are **not** backfilled.
- **Implication:** Dashboard metrics based on document `salesUserId` will **not** move when a customer is reassigned. New Customers uses `assignedSalesUserId`, which **will** reflect reassignment for customers created after reassignment only if the customer row was updated (existing customers keep one `assignedSalesUserId` field).

### 1.3 Sales Executive data scoping (existing)

| Surface | Scoped server-side? | Mechanism |
|---|---|---|
| Sales Executive Report API | **Yes** | `restrictSalesUserId()` in `src/lib/report-permissions.ts` forces `salesUserId = session.user.id` for `SALES_EXECUTIVE` |
| Payment Follow-up / Dispatch Report API | **Partial** | Same `restrictSalesUserId()` when `salesUserId` filter is passed |
| Dashboard `countOpenQuotations` | **Yes** | Passes executive id when role is `SALES_EXECUTIVE` |
| Dashboard `countBookedOrders` | **No** | Company-wide count only |
| Quotations list page/API | **No** | `listQuotations(prisma, companyId, {})` — no sales filter |
| PI list page/API | **No** | `listProformaInvoices(prisma, companyId, {})` — no sales filter |
| Customers list page/API | **No** | Optional `assignedSalesUserId` filter exists but pages do not auto-apply for executives |
| Dispatch list | **No** | `listDispatches` filters by company only |

**Dashboard implementation must enforce executive scoping in new analytics services; cannot rely on existing list pages.**

---

## 2. Sales Executive Report (Authoritative KPI Baseline)

**Source:** `src/lib/report-service.ts` → `getSalesExecutiveReport()`  
**API:** `GET /api/reports/sales-executive`  
**Permissions:** Super Admin, Sales Manager, Sales Executive (own data)

### 2.1 Population

Executives included:

```typescript
prisma.user.findMany({
  where: {
    status: "ACTIVE",
    companies: { some: { companyId } },
    roles: { some: { role: { name: { in: ["Sales Executive", "Sales Manager", "Super Admin"] } } } },
    ...(filters.salesUserId ? { id: filters.salesUserId } : {}),
  },
});
```

Rows with all-zero metrics are **excluded** unless `filters.salesUserId` is set.

### 2.2 Quotation Value

| Attribute | Value |
|---|---|
| **Model** | `Quotation` (`quotations`) |
| **Field** | `total_value` (sum) |
| **Date field** | `quotation_date` |
| **Date filter** | `quotationDate >= fromDate AND quotationDate <= toDate` (when provided) |
| **Status filter** | `status != DRAFT` (includes `SENT`, `EXPIRED`, `CONVERTED`) |
| **Ownership** | `sales_user_id = executive.id` |
| **Optional filter** | `customer.customer_type` when `customerType` filter set |
| **Formula** | `roundMoney(SUM(decimalToNumber(totalValue)))` |
| **GST** | `totalValue` is pre-computed document total (includes GST via line totals at creation) |

**Edge cases:**

- Revisions: each revision is a separate `Quotation` row linked via `parent_quotation_id`; all non-DRAFT revisions in date range are summed (potential double-count if multiple revisions overlap a period — **existing behaviour**).
- `refreshExpiredQuotations()` is **not** called by the report; expired status depends on data state at query time.

### 2.3 PI Value

| Attribute | Value |
|---|---|
| **Model** | `ProformaInvoice` (`proforma_invoices`) |
| **Field** | `total_value` (sum) |
| **Date field** | `pi_date` |
| **Date filter** | `piDate >= fromDate AND piDate <= toDate` |
| **Status filter** | **None** — all statuses included (`DRAFT`, `ISSUED`, `PENDING_BOOKING`, `BOOKED`, `PARTIALLY_DISPATCHED`, `FULLY_DISPATCHED`, `CANCEL_PENDING`, `CANCELLED`) |
| **Ownership** | `sales_user_id = executive.id` |
| **Formula** | `roundMoney(SUM(decimalToNumber(totalValue)))` |

**Edge cases:**

- Cancelled and draft PIs **are included** in PI Value per current code.
- Compare: `getCustomerPiMetrics()` excludes `DRAFT`, `CANCEL_PENDING`, `CANCELLED` for outstanding calculations — **inconsistent with report**.

### 2.4 Collection Value

| Attribute | Value |
|---|---|
| **Model** | `Payment` (`payments`) |
| **Field** | `amount` (sum) |
| **Date field** | `payment_date` |
| **Date filter** | `paymentDate >= fromDate AND paymentDate <= toDate` |
| **Status filter** | None (all payments) |
| **Ownership** | `proformaInvoice.salesUserId = executive.id` (via join) |
| **Optional filter** | `proformaInvoice.customer.customerType` |
| **Formula** | `roundMoney(SUM(decimalToNumber(amount)))` |
| **Partial payments** | Each payment row counted on its `payment_date`; multiple payments on same PI all count |

**Edge cases:**

- Payments on cancelled PIs are still counted if they exist.
- No allocation logic — full payment amount attributed, not proportional to PI line items.

### 2.5 Dispatched Value

| Attribute | Value |
|---|---|
| **Model** | `Dispatch` + `DispatchLine` |
| **Status filter** | `dispatches.status = DISPATCHED` only |
| **Date field** | `dispatch_date` |
| **Date filter** | `dispatchDate >= fromDate AND dispatchDate <= toDate` |
| **Ownership** | `proformaInvoice.salesUserId = executive.id` |
| **Value formula** | Per dispatch: `SUM(line.qty × proformaInvoiceItem.rate)` then `roundMoney` on total |
| **GST** | Uses PI item `rate` (pre-GST unit rate); **line value excludes GST** (same as Dispatch Report) |

**Excluded dispatch statuses:** `DRAFT`, `CANCEL_PENDING`, `CANCELLED`

**Cancellation / reversal:**

- Approved DC cancel sets `status = CANCELLED`, reverses `proformaInvoiceItem.dispatchedQty`, restores inventory (`src/lib/dispatch-service.ts`).
- Cancelled dispatches **fall out** of dispatched value queries automatically.
- No historical "negative dispatch" rows — reversal is status change + qty rollback.

**Edge case — year metrics on customer profile:**

- `getCustomerDispatchMetrics()` uses `dispatchedAt >= yearStart` (timestamp, local `new Date().getFullYear()`) — **different date basis** than report's `dispatchDate`.

### 2.6 New Customers

| Attribute | Value |
|---|---|
| **Model** | `Customer` (`customers`) |
| **Field** | count of rows |
| **Date field** | `created_at` |
| **Date filter** | `createdAt >= fromDate AND createdAt <= toDate` |
| **Ownership** | `assigned_sales_user_id = executive.id` |
| **Optional filter** | `customerType` |
| **Company scope** | **Not filtered by company** — customers are global master records |

**Edge cases:**

- Customer model has **no `companyId`**. A customer created once counts for an executive across all companies.
- Company-specific relationship is implicit via quotations/PIs/dispatches for that company, but New Customers metric is **not** company-dealings-based.

### 2.7 Module / Inverter / Other Units

**Not present in Sales Executive Report today.**

Proposed derivation (no existing authoritative function — must be validated in Command 2):

| Unit type | Classification | Source |
|---|---|---|
| Module units | `ProductCategory.name = 'Modules'` | `DispatchLine.qty` on `DISPATCHED` dispatches |
| Inverter units | `ProductCategory.name = 'Inverters'` | Same |
| Other units | `ProductCategory.name = 'Other'` | Same |
| Kit | `ProductCategory.name = 'Kit'` | **Not stored on dispatch lines** — kits explode to component lines at dispatch time (`src/lib/dispatch-service.ts`, `src/lib/kit-fulfillment.ts`) |

**Kit handling:** Dispatch lines contain **component products** (Modules, Inverters, etc.), not the Kit product. Module units from kit orders are counted via component lines with category `Modules`.

**Module Mastery metric:** PRD requires confirmed dispatched module units — maps to same source as Module units above with `status = DISPATCHED`.

---

## 3. Dashboard KPI Metrics (Detailed)

### 3.1 Quotation Value

Same as §2.2. **Authoritative function:** `getSalesExecutiveReport`.

**Default period (PRD):** This Month — use `defaultReportDateRange()` which returns UTC month start to today (`src/lib/reports.ts`).

---

### 3.2 PI Value

Same as §2.3. **Authoritative function:** `getSalesExecutiveReport`.

---

### 3.3 Collection Value

Same as §2.4. **Authoritative function:** `getSalesExecutiveReport`.

---

### 3.4 Dispatched Value

Same as §2.5. **Authoritative function:** `getSalesExecutiveReport`.

---

### 3.5 Dispatched Module Units

| Attribute | Value |
|---|---|
| **Primary source** | `dispatch_lines` → `products` → `product_categories` |
| **Quantity field** | `dispatch_lines.qty` |
| **Valid dispatch status** | `DispatchStatus.DISPATCHED` |
| **Invalid (excluded)** | `DRAFT`, `CANCEL_PENDING`, `CANCELLED` |
| **Product filter** | `product_categories.name = 'Modules'` |
| **Date field** | `dispatches.dispatch_date` |
| **Ownership** | `proforma_invoices.sales_user_id` via `dispatches.proforma_invoice_id` |
| **Formula** | `SUM(decimalToNumber(dispatchLine.qty))` where category is Modules |
| **Kit orders** | Count module **component** line qty (BOM explosion at dispatch) |

**Edge cases:**

- Partial dispatches: each DC line qty counts for its `dispatch_date` month.
- Serial-tracked modules: qty is still numeric on `dispatch_lines.qty` (serials in `dispatch_line_serials` for traceability).
- `plannedDispatchDate` on dispatch exists in schema but is **not used** in any report/metric today.

---

### 3.6 Today's Planned / Completed / Pending / Blocked Dispatches

There is **no single existing function** for this widget. Closest references:

| Concept | Existing code | Notes |
|---|---|---|
| Completed today (company) | `countTodaysDispatches()` | Count of `DISPATCHED` where `dispatchDate = toDateOnly(new Date())` — **company-wide, not executive-scoped** |
| Dispatch Today PIs | `inventory-timeline.ts` | Loads PIs with `dispatchTodayDate = todayDate` |
| Pending vs Dispatched | `inventory-timeline.ts` | PI has `DISPATCHED` DC **or** all items fully dispatched → `"Dispatched"`; else `"Pending"` |
| Also completed | `todaysDispatchedDcs` query | PIs dispatched today even without Dispatch Today flag |

#### Recommended mapping for dashboard (derived — **not yet implemented**)

**Today definition:** `toDateOnly(new Date())` compared to date columns (UTC calendar date from server clock — **not** Asia/Kolkata).

| Bucket | Proposed source records | Criteria |
|---|---|---|
| **Planned** | PIs with active Dispatch Today for today | `proforma_invoices.dispatch_today_date = today` OR pending `DISPATCH_TODAY` approval for today request |
| **Completed** | Dispatches | `status = DISPATCHED AND dispatch_date = today`, scoped by `proformaInvoice.salesUserId` |
| **Pending** | Dispatch Today PIs not yet dispatched | `dispatch_today_date = today` AND no `DISPATCHED` DC for PI (per `inventory-timeline.ts` logic) |
| **Blocked** | Dispatch Today awaiting approval | `approval_requests` where `module_type = DISPATCH_TODAY`, `status = PENDING`, `module_id = pi.id` — PI not yet with `dispatch_today_date` set OR approval blocking warehouse dispatch |

**Unit breakdown (Modules / Inverters / Other):** Sum line qty from today's completed + pending dispatch lines (or PI items for pending), grouped by `ProductCategory.name`.

**Fields involved:**

- `proforma_invoices.dispatch_today_date` (`@db.Date`)
- `proforma_invoices.dispatch_today_marked_at`, `dispatch_today_marked_by_id`
- `approval_requests` (`module_type = DISPATCH_TODAY`, `status = PENDING`)
- `dispatches.dispatch_date`, `dispatches.status`
- `dispatch_lines.qty`, `products.category_id`

**Blocked semantics from workflow (`markDispatchToday` in `pi-service.ts`):**

- Early dispatch (before `required_dispatch_min_date`) and/or cross-company stock transfer requires approval before `dispatch_today_date` is activated.
- Until approved, warehouse dispatch panel blocked; serialized PI shows `pendingDispatchTodayApproval: true`.

---

### 3.7 Outstanding Aging

**Authoritative function:** `getPaymentFollowupReport()` in `src/lib/report-service.ts`

| Attribute | Value |
|---|---|
| **Model** | `ProformaInvoice` + `Payment` |
| **PI status filter** | `ISSUED`, `PENDING_BOOKING`, `BOOKED`, `PARTIALLY_DISPATCHED`, `FULLY_DISPATCHED` |
| **Outstanding formula** | `calculateOutstanding(piValue, paid)` = `max(0, totalValue - SUM(payments.amount))` |
| **Ageing days** | `calculateAgeingDays(pi.piDate)` = floor days from `piDate` to `now` |
| **Ageing buckets (existing)** | `0-30`, `31-60`, `61-90`, `90+` via `getAgeingBucket()` |
| **Ownership filter** | Optional `salesUserId` on PI |
| **Included rows** | Only PIs with `outstanding > 0` |

**PRD mismatch:** PRD specifies buckets `0-7`, `8-15`, `16-30`, `30+`. Existing code uses **different buckets**.

**Date basis for ageing:** `pi_date` (not last payment date, not credit due date).

**Credit PIs:** Included if outstanding > 0; `creditStatus` and `creditDueDate` exposed in report row but **do not change ageing calculation**.

---

### 3.8 Expiring Quotations

**Related functions:** `refreshExpiredQuotations()`, `countOpenQuotations()`, `listQuotations()`

| Attribute | Value |
|---|---|
| **Model** | `Quotation` |
| **Open/active status** | `SENT` (for open count) |
| **Expired status** | `EXPIRED` (auto-set when `expiry_date < today` and status was `SENT`) |
| **Expiry field** | `expiry_date` |
| **Validity period** | `QUOTATION_VALIDITY_DAYS = 3` from `quotation_date` |
| **Ownership** | `sales_user_id` |
| **Auto-expire** | `refreshExpiredQuotations()` runs on list/count operations |

**PRD windows → code mapping:**

| PRD bucket | Query logic |
|---|---|
| Expires today | `status = SENT AND expiry_date = today` |
| Expires in 1–3 days | `status = SENT AND expiry_date BETWEEN today+1 AND today+3` |
| Expired | `status = EXPIRED` OR (`status = SENT AND expiry_date < today` before refresh runs) |

**Note:** With 3-day validity, "expires in 1–3 days" covers most of a sent quotation's remaining life.

---

### 3.9 Unpaid PIs

**Sources:** `countPendingPayments()`, `getPaymentFollowupReport()`, `getCustomerPiMetrics()`

#### Dashboard count (`countPendingPayments`)

| Attribute | Value |
|---|---|
| **PI statuses** | `ISSUED`, `PENDING_BOOKING`, `BOOKED`, `PARTIALLY_DISPATCHED` |
| **Unpaid condition** | `SUM(payments.amount) < totalValue` |
| **Scope** | Company-wide — **no sales executive filter** |
| **Excludes** | `FULLY_DISPATCHED` with balance (would not appear) |

#### Work queue detail (recommended: align with payment follow-up)

Use `getPaymentFollowupReport` fields: customer, piNo, piValue, paid, outstanding, ageingDays, salesExecutive.

**Ownership:** `proformaInvoice.salesUserId`

---

### 3.10 Quiet Customers

**Status: NOT IMPLEMENTED in codebase.**

No model or service detects "quiet customers" for retail sales.

**Available activity timestamps per customer (for future implementation):**

| Activity | Model / field | Company-scoped? |
|---|---|---|
| Customer record touch | `customers.updated_at` | No (global customer) |
| Customer created | `customers.created_at` | No |
| Quotation | `quotations.quotation_date`, `created_at` | Yes (`company_id`) |
| PI | `proforma_invoices.pi_date`, `created_at` | Yes |
| Payment | `payments.payment_date` | Yes (`company_id`) |
| Dispatch | `dispatches.dispatch_date` | Yes |
| Sales follow-up | **Does not exist** | — |
| Project enquiry follow-up | `project_enquiry_followups` | Separate module — **not retail sales** |

**Default ownership for quiet-customer scoping:** Use customers where `assigned_sales_user_id = executive` AND no qualifying activity in threshold window for **active company** dealings.

**Assumption required:** Define "qualifying activity" union and whether to use `assignedSalesUserId` vs documents owned by executive.

---

### 3.11 Relevant Sales Stock Watch

**Existing inventory/report sources (do not duplicate allocation logic):**

| Function | File | Purpose |
|---|---|---|
| `getBookedAvailableReport()` | `report-service.ts` | Per product/warehouse: `available`, `booked`, `freeQty = max(0, available - booked)` |
| `getReservedQtyReport()` | `report-service.ts` | Open committed qty on booked/partially-dispatched PIs by product |
| `getWarehouseStockForProduct()` | `inventory-service.ts` | Physical available, incoming, booked serial counts |
| `buildInventoryTimeline()` | `inventory-timeline.ts` | Reserved, net available, dispatch-today outgoing |

**Product relevance filter (PRD):** Products on executive's open quotations, open PIs, or booked PIs.

| Document state | Source models |
|---|---|
| Open quotations | `quotations.status = SENT`, items → `quotation_items.product_id` |
| Open PIs | PI statuses with undispatched qty: `ISSUED`, `PENDING_BOOKING`, `BOOKED`, `PARTIALLY_DISPATCHED` |
| Booked PIs | `status IN (BOOKED, PARTIALLY_DISPATCHED)` — reserved qty via inventory events |

**Requirement aggregation:** Sum remaining qty (`item.qty - item.dispatchedQty` for PIs; full `quotation_items.qty` for SENT quotations) per product.

**Available stock:** `getWarehouseStockForProduct` for PI's warehouse (or default warehouse logic from open documents).

**Status labels (PRD → derive from existing calcs):**

| Status | Suggested rule |
|---|---|
| AVAILABLE | `freeQty >= openRequirement` |
| LOW | `freeQty > 0 AND freeQty < openRequirement` (threshold configurable) |
| SHORT | `freeQty < openRequirement` |
| CONFLICT | Booked/reserved exceeds physical across conflicting PIs (see inventory timeline / reserved qty) |

**Priority (PRD):** Booked PIs → Open PIs → Open quotations — matches `getReservedQtyReport` sort order (booked first by `bookedAt` / `requiredDispatchMinDate`).

---

### 3.12 Approval Counts

**Source:** `listPendingApprovals()` / `countPendingApprovalsForUser()` in `src/lib/approvals-service.ts`

Returns items visible to **current user's approval permissions**, not all company approvals.

| PRD label | Code `ApprovalType` | Source |
|---|---|---|
| Booking Approvals | `PI_BOOKING` | PIs with `status = PENDING_BOOKING` + pending `ApprovalRequest` (`module_type = BOOKING`) |
| Early-Date PI Edits | `PI_EDIT` | `proforma_invoice_edit_requests.status = PENDING` |
| Unbook Requests | **No approval queue** | Unbook is direct action via `unbookProformaInvoice()` — **not** an approval type |
| Dispatch Today Requests | `DISPATCH_TODAY` | Pending `ApprovalRequest` (`module_type = DISPATCH_TODAY`) |
| Quotation pricing | `QUOTATION_PRICE` | Pending quotation item price approvals |

**Additional types in code (not in PRD manager strip):** `DC_CANCEL`, `PI_CANCEL`, `PI_CREDIT`, `PI_CREDIT_ACCOUNTS`, `CROSS_COMPANY_TRANSFER`, project/inventory types.

**Oldest waiting:** Sort key `requestedAt` ascending on flattened pending list.

**Company filter:** Applied when loading related PI/quotation rows (`companyId` on parent record); `approval_requests` table has **no `companyId`** — scoped indirectly.

---

### 3.13 New Customers

Same as §2.6.

---

## 4. Supporting Enumerations (Verified)

### QuotationStatus
`DRAFT`, `SENT`, `EXPIRED`, `CONVERTED`

### ProformaInvoiceStatus
`DRAFT`, `ISSUED`, `PENDING_BOOKING`, `BOOKED`, `PARTIALLY_DISPATCHED`, `FULLY_DISPATCHED`, `CANCEL_PENDING`, `CANCELLED`

### DispatchStatus
`DRAFT`, `DISPATCHED`, `CANCEL_PENDING`, `CANCELLED`

### ApprovalModuleType (sales-relevant)
`QUOTATION`, `BOOKING`, `DISPATCH_TODAY`, `DC_CANCEL`, `PI_CANCEL`, `PI_EDIT`, `PI_CREDIT`, `PI_CREDIT_ACCOUNTS`, `CROSS_COMPANY_TRANSFER`

### ApprovalRequestStatus
`PENDING`, `APPROVED`, `REJECTED`

### ProductCategory names (from `src/lib/products.ts`)
`Modules`, `Inverters`, `Other`, `Kit`

---

## 5. Date & Timezone Audit

| Function | Location | Behaviour |
|---|---|---|
| `parseReportDate` | `reports.ts` | UTC start of day |
| `endOfReportDay` | `reports.ts` | UTC end of day |
| `defaultReportDateRange` | `reports.ts` | UTC month start → today (UTC date string) |
| `toDateOnly` | `quotations.ts`, `dispatches.ts` | `Date.UTC(y, m, d)` from **local** `getFullYear/getMonth/getDate` |
| `calculateAgeingDays` | `reports.ts` | Millisecond diff / 86400000 from `piDate` to `now` |
| `isDispatchTodayActive` | `proforma-invoices.ts` | ISO date string equality (YYYY-MM-DD) |

**PRD requires `Asia/Kolkata`:** Not implemented. IST users near midnight may see today/tomorrow boundary errors relative to PRD.

---

## 6. Tax / GST Treatment

| Metric | GST included? |
|---|---|
| Quotation Value | Yes — stored `total_value` includes GST |
| PI Value | Yes — stored `total_value` includes GST |
| Collection Value | Payment amounts as recorded (typically gross amounts received) |
| Dispatched Value | **No** — `qty × rate` where `rate` is pre-GST PI item rate |
| Module/Inverter units | N/A (quantity only) |

---

## 7. Data Inconsistencies Discovered

| # | Area | Issue |
|---|---|---|
| 1 | PI Value | Report includes **all** PI statuses; customer metrics exclude cancelled/draft |
| 2 | Aging buckets | PRD (0-7/8-15/16-30/30+) vs code (0-30/31-60/61-90/90+) |
| 3 | Timezone | PRD Asia/Kolkata vs UTC/local hybrid |
| 4 | New Customers | Global customer `createdAt` + `assignedSalesUserId` — not company-specific acquisition |
| 5 | Dispatch value date | Report uses `dispatchDate`; customer dispatch metric uses `dispatchedAt` |
| 6 | Executive scoping | Reports API scoped; list pages and several dashboard counts are **company-wide** |
| 7 | Module/Inverter units | Not in Sales Executive Report — must be added without breaking value formulas |
| 8 | Unbook Requests | PRD approval bucket has no matching approval workflow (unbook is immediate) |
| 9 | Quiet customers / sales follow-ups | **No data model** — greenfield feature |
| 10 | Quotation revisions | Multiple non-draft revisions may inflate quotation value in a period |
| 11 | Customer reassignment | Historical KPIs stay on document `salesUserId`, not customer assignee |
| 12 | `plannedDispatchDate` | Schema field unused in metrics |

---

## 8. Assumptions Requiring Product Decision

1. **PI Value status filter:** Should dashboard exclude `DRAFT`, `CANCELLED`, `CANCEL_PENDING` even though current report includes them?
2. **Quiet customer activity definition:** Which events reset the inactivity clock? Is `assignedSalesUserId` the scope key?
3. **Today's dispatch "Planned":** Include only `dispatch_today_date = today`, or also PIs with `required_dispatch_min_date = today` not yet marked?
4. **Blocked dispatches:** Count pending `DISPATCH_TODAY` only, or also `CANCEL_PENDING` DCs and credit-blocked PIs?
5. **Aging buckets:** Adopt PRD buckets or keep payment follow-up report buckets for consistency?
6. **New Customers:** Count global customer creation or first quotation/PI per company?
7. **Manager approval summary:** Map PRD labels to actual approval types (PI_EDIT ≠ "Early-Date PI Edits" unless confirmed)?

---

## 9. Files Referenced

| File | Role |
|---|---|
| `src/lib/report-service.ts` | Authoritative KPI + payment follow-up + dispatch report |
| `src/lib/reports.ts` | Date/ageing/outstanding helpers |
| `src/lib/report-permissions.ts` | Executive scoping for reports |
| `src/lib/quotation-service.ts` | Quotations, expiry refresh, open counts |
| `src/lib/pi-service.ts` | PIs, payments, dispatch today, booking |
| `src/lib/dispatch-service.ts` | Dispatches, cancel, today's count |
| `src/lib/approvals-service.ts` | Pending approval aggregation |
| `src/lib/inventory-service.ts` | Stock levels |
| `src/lib/inventory-timeline.ts` | Dispatch today pending/dispatched logic |
| `src/lib/products.ts` | Product category constants |
| `src/lib/kit-fulfillment.ts` | Kit → component explosion |
| `src/lib/proforma-invoices.ts` | Dispatch today helpers |
| `src/app/(app)/dashboard/page.tsx` | Current placeholder dashboard |
| `prisma/schema.prisma` | Schema definitions |

---

## 10. REPORT_FORMULA_RECONCILIATION

This section verifies dashboard KPI formulas against authoritative report code. **Dashboard and funnel analytics must call shared functions extracted from these definitions — not reimplement queries.**

### 10.1 Reconciliation Matrix

| Dashboard metric | Authoritative function | Secondary cross-check | Dashboard alignment status |
|---|---|---|---|
| Quotation Value | `getSalesExecutiveReport` | — | **Aligned** (must reuse) |
| PI Value | `getSalesExecutiveReport` | — | **Aligned** (must reuse) |
| Collection Value | `getSalesExecutiveReport` | Sum of `Payment` rows | **Aligned** (must reuse) |
| Dispatched Value | `getSalesExecutiveReport` | Sum of `getDispatchReport` rows | **Minor rounding variance** (see §10.5) |
| Module Units | *(none)* | Derived from dispatch report line set | **New — must extend report layer** |
| Inverter Units | *(none)* | Derived from dispatch report line set | **New — must extend report layer** |
| Other Units | *(none)* | Derived from dispatch report line set | **New — must extend report layer** |
| Outstanding / ageing | `getPaymentFollowupReport` | `getCustomerPiMetrics` outstanding | **Bucket definitions differ from PRD** |
| New Customers | `getSalesExecutiveReport` | — | **Aligned** (must reuse) |

### 10.2 Shared Parameters (all value KPIs)

| Parameter | Implementation |
|---|---|
| **Company** | `companyId` from session |
| **Executive filter** | `salesUserId` — forced to session user for `SALES_EXECUTIVE` via `restrictSalesUserId()` |
| **Date range** | `fromDate` / `toDate` strings → `parseReportDate(fromDate)` / `endOfReportDay(toDate)` |
| **Customer type filter** | Optional `customerType` on quotation/PI/payment/dispatch queries |
| **Ownership** | Document `salesUserId` for quotations, PIs, collections, dispatches; `assignedSalesUserId` for new customers only |
| **Rounding** | `roundMoney()` = `Math.round(value * 100) / 100` |

**Default dashboard period ("This Month"):** Use `defaultReportDateRange()` until `Asia/Kolkata` month boundaries are implemented (Command 3+).

---

### 10.3 Quotation Value

#### Authoritative formula

```text
quotationValue = roundMoney(
  SUM(quotations.total_value)
  WHERE quotations.company_id = companyId
    AND quotations.sales_user_id = executiveId
    AND quotations.status != 'DRAFT'
    AND quotations.quotation_date BETWEEN fromDate AND toDate  -- when filtered
    AND customer.customer_type = customerType                -- when filtered
)
```

**Source:** `getSalesExecutiveReport()` lines 163–178, 266–268.

#### Status inclusion

| Status | Included |
|---|---|
| `SENT` | Yes |
| `EXPIRED` | Yes |
| `CONVERTED` | Yes |
| `DRAFT` | **No** |

#### Tax / GST

`total_value` is persisted document total. Line items use `calculateLineAmounts()` (`subtotal + gstAmount` → `lineTotal`). Document total is sum of line totals — **GST included**.

#### Partial / cancellation

- No partial quotation value concept; full document total counted once.
- Revisions: each revision is a separate row; parent linked via `parent_quotation_id`. **All non-draft revisions in range are summed** (no deduplication).

#### Cross-checks

| Surface | Formula match? | Notes |
|---|---|---|
| Dashboard `countOpenQuotations` | **No** | Count of `SENT` only — not value |
| Dashboard "Order Value This Month" | **Not implemented** | Placeholder shows `—` |
| Customer `openQuotationCount` | **No** | Count metric only |

#### Dashboard decision

**Reuse `getSalesExecutiveReport` quotation query verbatim.** Do not substitute open-quotation counts or customer metrics.

---

### 10.4 PI Value

#### Authoritative formula

```text
piValue = roundMoney(
  SUM(proforma_invoices.total_value)
  WHERE proforma_invoices.company_id = companyId
    AND proforma_invoices.sales_user_id = executiveId
    AND proforma_invoices.pi_date BETWEEN fromDate AND toDate  -- when filtered
    AND customer.customer_type = customerType                  -- when filtered
)
```

**Source:** `getSalesExecutiveReport()` lines 180–194, 269–271.

#### Status inclusion

| Status | Included in report |
|---|---|
| `DRAFT` | **Yes** |
| `ISSUED` | Yes |
| `PENDING_BOOKING` | Yes |
| `BOOKED` | Yes |
| `PARTIALLY_DISPATCHED` | Yes |
| `FULLY_DISPATCHED` | Yes |
| `CANCEL_PENDING` | **Yes** |
| `CANCELLED` | **Yes** |

**No status filter exists in authoritative code.**

#### Tax / GST

Same as quotations — `total_value` includes GST via line totals at PI creation/edit.

#### Partial payment

Does not affect PI Value — full document `total_value` always counted regardless of payments received.

#### Cancellation

Cancelled PIs remain in PI Value if `pi_date` falls in range. **No exclusion.**

#### Cross-checks

| Surface | Formula match? | Notes |
|---|---|---|
| `getCustomerPiMetrics` | **No** | Excludes `DRAFT`, `CANCEL_PENDING`, `CANCELLED` for outstanding |
| `countBookedOrders` | **No** | Count of `BOOKED` only |
| `countPendingPayments` | **No** | Count of unpaid PIs, not value |

#### Dashboard decision

**Reuse authoritative formula as-is** to match Sales Executive Report export. Document that PI Value includes cancelled/draft PIs — this is existing report behaviour, not a dashboard invention.

**Flag for product review:** If business intent is "active PI pipeline value", a filtered variant would diverge from the report.

---

### 10.5 Collection Value

#### Authoritative formula

```text
collectionValue = roundMoney(
  SUM(payments.amount)
  WHERE payments.proforma_invoice.company_id = companyId
    AND payments.proforma_invoice.sales_user_id = executiveId
    AND payments.payment_date BETWEEN fromDate AND toDate  -- when filtered
    AND proforma_invoice.customer.customer_type = customerType  -- when filtered
)
```

**Source:** `getSalesExecutiveReport()` lines 205–224, 272–274.

#### Status inclusion

- No filter on PI status — payments counted even if PI later cancelled.
- No filter on payment mode or account.

#### Partial payments

Each `payments` row is counted independently on its `payment_date`. Multiple partial payments on one PI all contribute.

#### Cancellation / reversal

- No payment reversal model — payments are not voided in schema.
- DC cancel does not reverse payments.

#### Cross-checks

| Surface | Formula match? | Notes |
|---|---|---|
| `calculateOutstanding` / payment follow-up | **Related** | Uses same payment sum for `paid`, but measures outstanding not collection |
| Accounts payments export | **Partial** | Lists payments; sum should match if same date/executive filters |

#### Dashboard decision

**Reuse authoritative formula.** Funnel "Collection" stage must use this definition.

---

### 10.6 Dispatched Value

#### Authoritative formula

```text
dispatchedValue = roundMoney(
  SUM over all dispatch_lines (
    dispatch_line.qty * proforma_invoice_item.rate
  )
  WHERE dispatches.company_id = companyId
    AND dispatches.status = 'DISPATCHED'
    AND dispatches.proforma_invoice.sales_user_id = executiveId
    AND dispatches.dispatch_date BETWEEN fromDate AND toDate  -- when filtered
    AND customer.customer_type = customerType                    -- when filtered
)
```

**Source:** `getSalesExecutiveReport()` lines 225–283.

#### Status inclusion

| Dispatch status | Included |
|---|---|
| `DISPATCHED` | **Yes** |
| `DRAFT` | No |
| `CANCEL_PENDING` | No |
| `CANCELLED` | No |

#### Tax / GST

**Pre-GST value:** `rate` is PI item unit rate before GST; `qty × rate` excludes GST. Document totals (`total_value`) include GST but dispatched value deliberately does not.

For modules priced per Wp: `qty` on dispatch line is module/panel count; value = `qty × rate` (rate is ₹/Wp stored on PI item — same as dispatch DC display).

#### Cancellation / reversal

- Approved cancel → `status = CANCELLED`, `dispatched_qty` reduced on PI items, inventory restored.
- Cancelled DCs excluded from all future sums automatically.

#### Date basis

**`dispatch_date`** (date-only column), not `dispatched_at`.

#### Cross-check: Dispatch Report

`getDispatchReport()` uses **identical filters** and per-line formula `roundMoney(qty × rate)`.

**Rounding variance:**

| Aggregation | Rounding |
|---|---|
| Sales Executive Report | Single `roundMoney()` on **grand total** |
| Dispatch Report | `roundMoney()` **per line**, then sum rows |

Summing dispatch report `value` column may differ from executive `dispatchedValue` by small amounts (≤ few paise per line). **Dashboard must use executive report aggregation**, not sum of rounded line rows.

#### Cross-check: `serializeDispatch().totalValue`

Uses same unrounded line sum as executive report, then `roundMoney` per dispatch — still may differ from executive grand total when multiple dispatches.

#### Cross-check: `getCustomerDispatchMetrics`

Uses `dispatchedAt >= yearStart` (timestamp) — **different date field and window**. Do not use for dashboard KPIs.

#### Dashboard decision

**Reuse executive report dispatched value query.** Drill-down to Dispatch Report is acceptable for line detail; KPI card must not sum rounded line values.

---

### 10.7 Module Units

#### Authoritative formula

**Does not exist in reports today.** Must be added as an extension using **identical dispatch scope** as §10.6.

#### Proposed formula (aligned with dispatched value scope)

```text
moduleUnits = SUM(dispatch_lines.qty)
  WHERE dispatches.status = 'DISPATCHED'
    AND dispatches.company_id = companyId
    AND dispatches.proforma_invoice.sales_user_id = executiveId
    AND dispatches.dispatch_date BETWEEN fromDate AND toDate
    AND products.category.name = 'Modules'
```

Join path: `dispatch_lines` → `products` → `product_categories`.

#### Status / cancellation / date / ownership

Same as §10.6 dispatched value.

#### Kit handling

Kit PI items explode to component lines at dispatch. Module panels appear as `dispatch_lines` with component product category `Modules`. **Count component qty, not kit product qty.**

#### Tax / partial payment

Not applicable (quantity metric).

#### Module Mastery

Uses **same unit count** as `moduleUnits` for a calendar month window. Module Mastery adds level progression logic on top — it must not use a different qty source.

#### Cross-check

Sum of `getDispatchReport` rows where product category = Modules (requires adding category to dispatch report join or separate shared function).

#### Dashboard decision

**Implement `getDispatchedUnitTotals()` alongside report service** with shared `dispatchWhere` builder. Module/Inverter/Other must use same filters as dispatched value.

---

### 10.8 Inverter Units

#### Proposed formula

```text
inverterUnits = SUM(dispatch_lines.qty)
  -- same WHERE as moduleUnits
  AND products.category.name = 'Inverters'
```

All reconciliation rules identical to §10.7 with category filter `Inverters`.

#### Dashboard decision

Same shared function as module units.

---

### 10.9 Other Units

#### Proposed formula

```text
otherUnits = SUM(dispatch_lines.qty)
  -- same WHERE as moduleUnits
  AND products.category.name = 'Other'
```

#### Excluded categories

| Category | Treatment |
|---|---|
| `Kit` | Never on dispatch lines (components dispatched instead) |
| `Modules` | Counted in moduleUnits |
| `Inverters` | Counted in inverterUnits |
| Uncategorized / future categories | **Not counted** in any unit bucket until explicitly mapped |

#### Dashboard decision

Same shared function. Product contribution chart may show Modules / Inverters / Other composition from these three totals.

---

### 10.10 Funnel Stage Definitions (Dashboard)

PRD funnel: Quotation → PI → Collection → Dispatch.

| Stage | Metric | Authoritative source |
|---|---|---|
| Quotation | Quotation Value | §10.3 |
| PI | PI Value | §10.4 |
| Collection | Collection Value | §10.5 |
| Dispatch | Dispatched Value | §10.6 |

Conversion percentages: `nextStage / prevStage × 100` using same date range and executive scope. **Use value metrics, not unit counts**, unless a separate chart explicitly shows units.

---

### 10.11 Period Comparison (KPI strip "vs previous period")

No existing implementation. Recommended approach (Command 3):

```text
current = getSalesExecutiveReport(prisma, companyId, { ...filters, fromDate, toDate })
previous = getSalesExecutiveReport(prisma, companyId, { ...filters, fromDate: prevFrom, toDate: prevTo })
deltaPercent = (current - previous) / previous * 100   -- when previous > 0
```

Previous period = equal-length window immediately before current range (for "This Month", use prior calendar month with same UTC boundaries until IST utility exists).

---

### 10.12 Inconsistencies Requiring Resolution Before Implementation

| # | Metric | Issue | Resolution |
|---|---|---|---|
| R1 | Dispatched Value | Dispatch Report line rounding ≠ executive grand total | Dashboard KPI uses executive aggregation; detail drill-down may show line-rounded values |
| R2 | PI Value | Includes cancelled/draft PIs | **Keep report behaviour** unless product explicitly changes report first |
| R3 | Module/Inverter/Other | No authoritative function yet | Add shared `getDispatchedUnitTotals()` in report layer with dispatch scope from §10.6 |
| R4 | Outstanding ageing | PRD buckets ≠ `getAgeingBucket()` | Dashboard widget must choose: (a) match payment follow-up report, or (b) new buckets with PRD labels — **cannot mix on same screen without relabelling** |
| R5 | Date boundaries | UTC vs Asia/Kolkata | All period KPIs affected; implement shared IST date helper before claiming month-boundary correctness |
| R6 | New Customers | Global customer, not company-specific | Keep report behaviour; note in manager dashboard |
| R7 | Dashboard placeholders | `countBookedOrders`, `countOpenQuotations` are counts not values | Replace placeholders with value KPIs from report — do not show counts as "Order Value" |
| R8 | Customer dispatch metric | Uses `dispatchedAt` not `dispatchDate` | Do not use `getCustomerDispatchMetrics` for dashboard KPIs |
| R9 | Quotation revisions | Multiple revisions double-count in period | Inherited report behaviour — document in funnel tooltips |

### 10.13 Implementation Constraint (Command 5+)

Before UI work:

1. Extract shared query builders from `getSalesExecutiveReport` for quotation, PI, payment, dispatch value, and unit totals.
2. Add unit tests asserting `dispatchedValue` and unit totals share identical dispatch row sets.
3. Add test asserting sum of unrounded line values matches executive `dispatchedValue` rounding policy.
4. Do **not** duplicate formulas in React components or parallel API handlers.

---

## 11. Next Step

**Command 3:** Create `SALES_DASHBOARD_IMPLEMENTATION_PLAN.md` with architecture proposal based on this audit and reconciliation.
