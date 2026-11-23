# PRD: Monthly Serial Number Audit

Status: DRAFT v2, incorporates answers from stakeholder review
Owner: TBD
Date: 2026-11-21

## 1. Problem

Serialized stock is tracked by serial number in the system. Physical stock can drift from system stock through missed scans, mis-keyed serials, or unrecorded movements. The daily audit counts quantities only, and the opening audit is a one-time event. There is no recurring, serial-level reconciliation across the business.

## 2. Goal

Once a month, a Super Admin starts one audit run covering every serial in the system (all companies, all warehouses). Auditors scan what is physically on hand today. The system reports serials that are missing or unknown. After Super Admin approval, inventory is updated to match the scanned serials.

## 3. Scope

In scope:
- One audit run covering all companies and all warehouses.
- Serialized products (new audit section A).
- Non-serialized products (new audit section B, separate entry screen).
- Multiple auditors scanning at the same time.
- Scanning by camera or handheld scanner, and by pasting serial text into a box.
- Missing and unknown serial report, exported to Excel.
- Super Admin approval that updates inventory.

Out of scope:
- Automatic scheduling. Runs are started manually.
- Items in transit. All stock in the system is treated as on hand.
- Changes to the daily audit or opening audit. The monthly audit runs alongside them.

## 4. Users and Roles

- Super Admin: starts, cancels, reopens and closes runs; reviews and resolves Missing serials; approves and applies the final result; exports reports.
- Warehouse (WH) user: scans serials and enters non-serialized counts during an open run.
- Other roles: no access.

## 5. Functional Requirements

FR-1 Run creation. Super Admin starts a run manually. One run covers all companies and all warehouses. A run can be cancelled or reopened while it is not yet approved.

FR-2 Freeze. While a run is open, incoming, dispatch and transfer movements are stopped for the duration of the run.

FR-3 Expected list snapshot. On start, the system snapshots every serialized item on hand in every company and warehouse. Items on pending purchase are not on hand and are excluded. Items in transit are not in scope.

FR-4 Scanning (section A, serialized). Auditors add serials by:
- camera or handheld scanner, one at a time; or
- pasting a list of serials into a text box, which is split into individual serials.

FR-5 Concurrent scanning. Multiple auditors scan into the same run at once. Each serial is recorded once for the whole run, not per warehouse. If a serial is scanned by a second person, the system shows "already scanned" and does not record it again.

FR-6 Scan classification. Each scanned serial is classified as:
- Found: in the expected snapshot and scanned.
- Unknown: scanned but not in the expected snapshot.
- Already scanned: scanned by another auditor earlier in the run.

FR-7 Missing serials. At close, every expected serial with no scan is listed as Missing.

FR-8 Non-serialized entry (section B). A separate screen where WH users enter counted quantities per non-serialized product. The system shows the expected quantity alongside it.

FR-9 Close and report. Super Admin closes scanning. The system produces a report with totals by product, company and warehouse, plus the full Missing and Unknown lists. The report is exported to Excel.

FR-10 Investigation. Missing serials are routed to Super Admin for investigation. Super Admin records a finding for each one.

FR-11 Additional stock. Serials scanned but not in the system ("Additional Stock") do not change inventory on approval. They are exported as an Excel list for investigation and later added through manual stock entry, where Super Admin selects the warehouse.

FR-11a Reconciliation rules (serialized). Each serial is compared between the record and the audit:

| As per Record | As per Audit | Result | Action |
|---|---|---|---|
| Available | Not Available | Missing | Investigation. Listed in Excel. |
| Available | Available | OK | Inventory kept as per these numbers. |
| Not Available | Available | Additional Stock | Investigation. Listed in Excel. Added later via manual stock entry. |

FR-11b Reconciliation rules (non-serialized). Quantity per record is compared with quantity per audit. Super Admin approves; inventory is set to the audited quantity.

FR-12 Approval. Only Super Admin can approve. On approval, inventory is updated to match the scanned serials, and every change is written to the movement history with a reference to the run.

FR-13 Lock. After approval the run is locked and cannot be edited.

FR-14 Audit trail. The run, its scans, its report, the investigation notes and the approval are all kept.

## 6. Process Flow

1. Super Admin starts the run. Freeze begins. Expected snapshot is taken.
2. Auditors scan serials (section A) and enter quantities (section B), in parallel.
3. Super Admin closes scanning. Missing and Unknown lists are built.
4. Super Admin investigates Missing serials and resolves Unknown serials.
5. Super Admin reviews the Excel report and approves. Inventory is updated. Freeze ends. Run is locked.

## 7. Non-Functional Requirements

- Scan response under 1 second for a single scan.
- Pasted lists of several thousand serials should be accepted in one action.
- Approval is atomic: all inventory changes apply, or none do.
- Limits on number of serials and concurrent auditors: to be confirmed.

## 8. Success Metrics

- Every expected serial is either Found or listed as Missing with a finding.
- After approval, system serial counts match scanned serial counts for every product, company and warehouse.

## 9. Open Questions

Answered:
- Scope: one run for all companies and warehouses.
- Movements: stopped during the run.
- Transit: none; purchase items on pending purchase stay as they are.
- Duplicates: a serial scanned by a second person shows "already scanned".
- Missing: investigated by Super Admin.
- Unknown: created as new stock.
- Non-serialized products: separate audit section.
- Approval: Super Admin only.
- Roles: Super Admin and WH.
- Scanner: camera/handheld and pasted text.
- Schedule: manual start; cancel and reopen allowed.
- Report: Excel, Super Admin.
- Existing audits: run alongside daily and opening audits.

Clarified:
- Existing parameters (company, warehouse, location) are not changed by the audit. The audit only checks whether each serial number is present in the system or not. Auditors do not select a warehouse while scanning.
- Section B quantity variances are approved by Super Admin the same way as serials.

- Retention: audit records (runs, scans, reports) are kept indefinitely.
- Additional Stock serials are not added directly. They are listed for investigation and added later via manual stock entry, where Super Admin selects the warehouse.

Still open: none blocking. Confirm the reconciliation table in FR-11a and FR-11b.
