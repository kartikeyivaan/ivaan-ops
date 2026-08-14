# Ivaan Ops — Project Material Assignment & Projects Dispatch PRD

**Document Type:** Product Requirements Document  
**Project:** Ivaan Ops  
**Status:** Ready for Implementation  
**Version:** 1.0  
**Date:** 2026-08-12  
**Primary Users:** Projects Manager, Warehouse / Dispatch Executive, Super Admin, Admin, Purchase Manager  
**Related Docs:** `PROMPT_11` through `PROMPT_14`, `IMPLEMENTATION-MAP-PROJECT-MATERIAL-DISPATCH.md`

---

## 1. Purpose

This PRD defines the **B2C Projects execution flow** in Ivaan Ops: converting an approved **Project Proposal** into an executable **Project**, assigning material from inventory, staging stock at **Jalgaon Projects**, and dispatching to the customer site — including partial dispatch, purchase-request backfill for short stock, and project closure with auto-return of unused material.

This flow is **separate from B2B Sales**, which continues to use Quotation → Proforma Invoice → Retail Dispatch with payment and booking logic.

The objective is to give the Projects team a single operational path from won proposal to site delivery, with inventory traceability, PM-controlled material changes, and warehouse dispatch tooling consistent with existing retail DC practices.

---

## 2. Goals

1. Create a **Project** entity when an approved proposal is converted — not just a status flag.
2. Default **Material Assignment** lines from the confirmed proposal revision (package BOM + extras).
3. Allow **Add Row** for additional catalogue products (same UX pattern as Quotation Add Row).
4. Require **Projects Manager approval** for changed and new assignment lines before stock moves.
5. **Auto-transfer** available stock from **ISE Jalgaon HO** first, then **PCM Jalgaon HO** if short — no separate Sales Manager approval for cross-company use when PM has approved material.
6. Stage assigned stock at **Jalgaon Projects (JAL-PRJ)** warehouse.
7. **Auto-create Purchase Requests** for quantities that cannot be fulfilled at approval time; link PR lines back to project material lines.
8. Provide **Projects Dispatch** tab under Inventory → Dispatches with unified search (proposal no., customer name, site name, project no.).
9. Support **partial dispatch** to customer site with serial scan for panels/inverters and qty-only for bulk items.
10. **Kit/BOM products** explode to components on assignment derivation and dispatch (same rules as retail dispatch).
11. Allow **PM-only project close** that blocks new dispatches and auto-returns unused qty to source warehouses.
12. Preserve existing design system, RBAC, audit logging, and mobile responsiveness.

---

## 3. Non-Goals

The following are outside this implementation:

- Payment collection, PI creation, or booking logic for B2C projects
- Changes to B2B Quotation → PI → Retail Dispatch flow
- Billing, invoicing, or Tally integration for project dispatches
- Site installation scheduling or service visit management
- Customer portal or public tracking
- Automatic supplier PO creation from purchase requests (PR creation only)
- Machine-learning demand forecasting
- New warehouse creation beyond existing **Jalgaon Projects (JAL-PRJ)**

---

## 4. Key Definitions

### 4.1 Project Proposal (Commercial)
The pre-sale EPC/rooftop document (`ProjectProposal` + `ProjectProposalRevision`). Tracks pricing, package, customer, and discount approval. Status ends at **Converted** when handed to execution.

### 4.2 Project (Execution)
A new operational entity created on convert. Tracks material assignment, stock staging, dispatch, and closure. Has its own lifecycle status distinct from proposal status.

### 4.3 Material Assignment
The set of product lines and quantities promised for a project. Defaults from proposal BOM; may include PM-added lines. Requires PM approval for **changed and new lines only**.

### 4.4 Jalgaon Projects (Projects WO)
The existing ISE warehouse **Jalgaon Projects** (`JAL-PRJ`). Staging location for project material before site dispatch.

### 4.5 Stock Source Priority
On PM approval, system allocates from **ISE Jalgaon HO** first. If insufficient, falls back to **PCM Jalgaon HO**. Allocation is recorded per line for return-on-close.

### 4.6 Pending Stock
Assignment line qty that PM approved but could not be transferred because stock was unavailable. Triggers auto Purchase Request; fulfilled when stock arrives.

### 4.7 Project Dispatch
Delivery challan from Jalgaon Projects to customer site. Same operational fields as retail DC (vehicle, receiver, signature, PDF) with header **"Project Dispatch"**.

### 4.8 Partial Dispatch
Shipping less than the full assigned balance on one or more lines. Balance remains in Jalgaon Projects until a subsequent dispatch, manual return, or auto-return on project close.

### 4.9 Delta Approval
Re-approval model where **unchanged, previously approved lines** are not re-submitted; only **new lines** and **qty changes** on existing lines require PM approval.

---

## 5. Business Context

| Track | Entry Document | Payment | Dispatch |
|-------|----------------|---------|----------|
| **B2B Sales** | Sales Quotation | PI, booking, advance rules | Retail Dispatch (from booked PI) |
| **B2C Projects** | Project Proposal | None in this phase | Projects Dispatch (from Jalgaon Projects) |

---

## 6. Roles and Permissions

### 6.1 Projects Manager
- Convert approved proposal to project (or delegate convert, then owns assignment).
- Create and edit material assignment (draft).
- Add rows, change qty, submit for material approval.
- Approve/reject **Project Material Approval** requests (changed + new lines).
- Create and confirm project dispatch DCs (with Warehouse).
- Close project (blocks new dispatch, triggers auto-return).

### 6.2 Warehouse / Dispatch Executive
- View projects ready for dispatch.
- Create and confirm project dispatch DCs.
- Scan serials for panels/inverters on project DC.
- Optional manual return of unused qty from Jalgaon Projects to source HO.

### 6.3 Super Admin / Admin
- Full access to all project, assignment, dispatch, and close actions.
- Override with audit logging where permitted by platform conventions.

### 6.4 Purchase Manager
- View and process auto-created purchase requests linked to projects.
- Incoming stock fulfillment triggers material transfer hook (system).

### 6.5 Sales Manager / Sales Executive
- No direct access to project material assignment or projects dispatch (unless explicitly granted Super Admin).
- B2B retail flow unchanged.

---

## 7. Status Model

### 7.1 Proposal Status (existing — UI labels clarified)

| Status | UI Heading |
|--------|------------|
| `DRAFT` | Draft Proposal |
| `SENT` | Sent to Customer |
| `PENDING_APPROVAL` | Pending Discount Approval |
| `APPROVED` | Approved Proposal |
| `CONVERTED` | Converted to Project |
| `REJECTED` | Rejected |
| `EXPIRED` | Expired |

**Proposal detail sections:** Proposal Summary | Commercial Approval | Project Handoff

### 7.2 Project Status (new)

| Status | UI Heading | Description |
|--------|------------|-------------|
| `OPEN` | Project Open | Created; assignment not started |
| `MATERIAL_DRAFT` | Material Assignment (Draft) | PM editing lines |
| `MATERIAL_PENDING_APPROVAL` | Pending Material Approval | Awaiting PM approval (delta) |
| `MATERIAL_ASSIGNED` | Material Assigned | Stock transferred and/or PR raised |
| `READY_FOR_DISPATCH` | Ready for Dispatch | At least one line has dispatchable balance |
| `PARTIALLY_DISPATCHED` | Partially Dispatched | Some qty shipped |
| `FULLY_DISPATCHED` | Fully Dispatched | All required qty shipped |
| `CLOSED` | Project Closed | Terminal; no new dispatch |

### 7.3 Material Line Status

| Status | UI Badge |
|--------|----------|
| `DRAFT` | Draft |
| `PENDING_APPROVAL` | Pending Approval |
| `APPROVED` | Approved |
| `PENDING_STOCK` | Pending Stock |
| `ASSIGNED` | In Projects WH |
| `PARTIALLY_DISPATCHED` | Partial Dispatch |
| `FULLY_DISPATCHED` | Fully Dispatched |

### 7.4 Material Line Source

| Source | UI Badge |
|--------|----------|
| `PROPOSAL` | From Proposal |
| `ADDED` | Added Line |

Qty increase on a proposal line marks **Qty Revised** and requires delta approval.

### 7.5 Approval Type (new)

| Type | UI Heading | Approver |
|------|------------|----------|
| `PROJECT_MATERIAL` | Project Material Approval | Projects Manager |

Existing `PROJECT_PROPOSAL` (discount) approval is unchanged.

---

## 8. User Flows

### 8.1 Convert Proposal to Project

**Preconditions:** Proposal status = `APPROVED`.

**Steps:**
1. PM selects **Convert to Project** on proposal detail.
2. System creates `Project` with unique `projectNo`, links `proposalId` and current `revisionId`.
3. Copies customer name, mobile, site address from current revision.
4. Sets proposal status = `CONVERTED`; records `convertedAt`, `convertedBy`.
5. Sets project status = `OPEN`.
6. UI prompts **Start Material Assignment**.

**Postcondition:** Proposal is read-only for commercial edits. Execution tracked on Project.

### 8.2 Material Assignment (Draft)

**Actor:** Projects Manager.

**Steps:**
1. PM opens Project detail → **Material Assignment**.
2. System pre-populates lines from proposal revision via BOM resolver (`proposal-bom` + package mapping to products).
3. Kit/package lines stored as product lines; kits explode at transfer/dispatch time.
4. PM may **Add Row** (product + qty) — any catalogue product allowed; prefer proposal categories in UI hints.
5. PM may edit qty on proposal lines (marks line as qty revised).
6. PM may remove undispatched added lines in draft.
7. PM saves draft → project status = `MATERIAL_DRAFT`.

**Default view:** All lines from confirmed proposal revision with columns: Product | Source | Required Qty | Assigned | Dispatched | Balance | Status.

### 8.3 Submit for Material Approval (Delta)

**Steps:**
1. PM clicks **Submit for Approval**.
2. System identifies lines where `approvalStatus != APPROVED` or qty changed since last approval.
3. Creates `ApprovalRequest` type `PROJECT_MATERIAL` with delta lines only.
4. Unchanged approved lines shown read-only on approval screen.
5. Project status → `MATERIAL_PENDING_APPROVAL`.

### 8.4 PM Approve Material

**Steps:**
1. PM reviews delta lines on Approvals hub or project detail.
2. On **Approve:**
   - For each approved line qty, attempt allocation:
     - **Step A:** ISE Jalgaon HO available qty
     - **Step B:** Remaining from PCM Jalgaon HO
   - Create auto `InventoryTransfer`(s) source HO → Jalgaon Projects; auto dispatch + receive.
   - Record per-line `stockSourceLog` (warehouse, company, qty).
   - For unfulfilled qty: set line `PENDING_STOCK`; auto-create or merge `PurchaseRequest` line with links to `projectId`, `proposalNo`, `projectMaterialLineId`; priority `HIGH`.
3. Update project status to `MATERIAL_ASSIGNED` or `READY_FOR_DISPATCH` as applicable.
4. Write audit log.

**On Reject:** Return project to `MATERIAL_DRAFT`; delta lines remain pending.

**Rule:** PM may approve even when stock is insufficient — short qty goes to Pending Stock + PR.

### 8.5 PR Fulfillment Hook

**Trigger:** Incoming lot received against PR line linked to `projectMaterialLineId`.

**Steps:**
1. Calculate newly fulfilled qty for project line.
2. Auto-transfer fulfilled qty from appropriate HO → Jalgaon Projects.
3. Update line assigned qty; clear `PENDING_STOCK` when fully assigned.
4. Notify PM / update dispatch queue if project becomes ready.

### 8.6 Projects Dispatch

**Preconditions:** Project not `CLOSED`; line has balance in Jalgaon Projects.

**Steps:**
1. Warehouse or PM opens **Inventory → Dispatches → Projects Dispatch** tab.
2. Search by proposal no., customer name, site name, or project no.
3. Select project → **New Project Dispatch**.
4. Form mirrors retail dispatch: vehicle, receiver, signature; header **Project Dispatch**.
5. Per line: Required | Assigned | Dispatched | **Dispatch Now** (≤ balance).
6. Kit products explode to BOM components (`kit-fulfillment.ts`).
7. Serial scan for panels/inverters; qty-only for bulk.
8. Confirm DC → deduct Jalgaon Projects stock; update line dispatched qty; update project dispatch status.
9. Generate PDF with project ref, proposal no., customer, site.

**Partial dispatch:** Allowed. Multiple DCs per project. Balance stays in Jalgaon Projects.

### 8.7 Manual Return (Optional)

**Actor:** Warehouse or PM.

**Steps:**
1. From project detail or dispatch screen, select **Return to HO**.
2. Choose line and qty (≤ balance in Jalgaon Projects).
3. Transfer Jalgaon Projects → original source warehouse per `stockSourceLog`.
4. Reduce assigned qty accordingly.

### 8.8 Close Project

**Actor:** Projects Manager only.

**Preconditions:** PM confirms close (no hard block on partial dispatch — business accepts close with balance).

**Steps:**
1. PM selects **Close Project**.
2. System immediately blocks creation/confirmation of new project dispatches.
3. Auto-return all unused qty from Jalgaon Projects to source warehouses per `stockSourceLog`.
4. Project status → `CLOSED`.
5. Audit log with remarks.

---

## 9. UI Requirements

### 9.1 Navigation

| Location | Change |
|----------|--------|
| Projects | Add **Projects** list (`/projects/list` or extend `/projects`) |
| Project detail | New page `/projects/[id]` |
| Inventory → Dispatches | Add tab: **Retail Dispatch** \| **Projects Dispatch** |
| Approvals | Show **Project Material Approval** type |
| Purchase → Requests | Show project ref + proposal no. on linked PRs |

### 9.2 Project List

Columns: Project No | Proposal No | Customer | Site | Project Status | Dispatch Status | PM/Sales User  
Filters: Status, date range, dispatch status  
Search: Unified box (proposal no., customer, site, project no.)

### 9.3 Material Assignment Grid

- **Add Row** button (same interaction pattern as `quotation-form.tsx` Add Row).
- Line badges: From Proposal | Added Line | Qty Revised.
- Status badges: Pending Stock | In Projects WH | Partial Dispatch | Fully Dispatched.
- Actions: Submit for Approval (enabled when delta exists).

### 9.4 Projects Dispatch Tab

- Searchable list of projects with dispatchable balance.
- Status chips: Ready | Partial | Complete | Closed.
- Row opens project dispatch form (reuse `dispatch-form.tsx` patterns).

### 9.5 Proposal Detail — Project Handoff Section

When `CONVERTED`: show link to Project record, converted date/user.  
When `APPROVED`: show **Convert to Project** CTA.

---

## 10. Data Requirements

### 10.1 New Entities

See `IMPLEMENTATION-MAP-PROJECT-MATERIAL-DISPATCH.md` for full schema. Summary:

- `Project`
- `ProjectMaterialAssignment`
- `ProjectMaterialLine`
- `ProjectDispatch` + `ProjectDispatchLine` (+ serials) — or extend `Dispatch` with `dispatchType` and `projectId`

### 10.2 Extended Entities

- `PurchaseRequest` / `PurchaseRequestLine` — optional FKs to project and material line
- `ApprovalRequest` — new type `PROJECT_MATERIAL`
- `ProjectProposal` — optional `projectId` FK back-link

### 10.3 Numbering

- **Project No:** `PRJ-{FY}-{SEQUENCE}` (ISE company scope) via `DocumentSequence`
- **Project DC No:** `{COMPANY}-PDC-{FY}-{SEQUENCE}` (distinct from retail `DC` prefix) or reuse DC sequence with type flag — implementer to choose in Prompt 13; PRD recommends **`ISE-PDC-26-27-00001`** pattern.

### 10.4 Audit

All create/update/approve/transfer/dispatch/close actions write `AuditLog` entries with `reference` = projectNo or proposalNo.

---

## 11. Integration Points

| Existing Module | Integration |
|-----------------|-------------|
| `project-proposal-service.ts` | Extend convert to create Project |
| `proposal-bom.ts` | Derive default material lines |
| `transfer-service.ts` | HO → JAL-PRJ auto transfers |
| `cross-company-transfer-service.ts` | PCM fallback without SM approval when PM material approved |
| `purchase-request-service.ts` | Auto-create PR from short lines |
| `kit-fulfillment.ts` | Kit explosion on dispatch |
| `dispatch-service.ts` | Patterns for confirm, serials, PDF |
| `approvals-service.ts` | New `PROJECT_MATERIAL` type |

---

## 12. Business Rules Summary

| # | Rule |
|---|------|
| R1 | Only `APPROVED` proposals can convert |
| R2 | Convert creates Project; proposal becomes `CONVERTED` |
| R3 | Material assignment is a separate step after convert |
| R4 | Default lines from proposal revision BOM |
| R5 | Add Row allowed; any catalogue product |
| R6 | Delta approval only (changed + new lines) |
| R7 | Stock priority: ISE HO → PCM HO |
| R8 | PM material approval covers cross-company PCM use |
| R9 | Short stock: PM can approve; auto PR; Pending Stock until arrival |
| R10 | Assigned stock stages at Jalgaon Projects |
| R11 | Partial dispatch allowed |
| R12 | Kits explode to components |
| R13 | Serial scan: panels/inverters; bulk qty-only |
| R14 | Project DC PDF header: "Project Dispatch" |
| R15 | Warehouse + PM can dispatch |
| R16 | Only PM can close project |
| R17 | Close blocks new dispatch immediately |
| R18 | Close auto-returns unused qty to source HO |
| R19 | Assignment open until close — multiple add/approve cycles |
| R20 | No payment logic in this flow |

---

## 13. Acceptance Criteria

### 13.1 Convert
- [ ] Approved proposal converts to Project with unique projectNo
- [ ] Proposal status = CONVERTED; link to project visible
- [ ] Non-approved proposal cannot convert

### 13.2 Material Assignment
- [ ] Default lines match proposal BOM/products
- [ ] Add Row works like quotation Add Row
- [ ] Submit sends only delta lines to approval
- [ ] Unchanged approved lines skip re-approval

### 13.3 Stock & PR
- [ ] ISE HO allocated first, PCM HO second
- [ ] Auto transfer to Jalgaon Projects on approval
- [ ] Short qty creates linked PR with project + proposal ref
- [ ] Stock arrival triggers transfer to Jalgaon Projects

### 13.4 Dispatch
- [ ] Projects Dispatch tab visible under Dispatches
- [ ] Unified search works across proposal no., customer, site, project no.
- [ ] Partial dispatch updates balances correctly
- [ ] Kit explosion and serial rules applied
- [ ] PDF shows "Project Dispatch" header

### 13.5 Close
- [ ] Only PM can close
- [ ] New dispatch blocked after close
- [ ] Unused qty auto-returned to source warehouses

### 13.6 Regression
- [ ] B2B Quotation → PI → Retail Dispatch unchanged
- [ ] Existing proposal discount approval unchanged

---

## 14. Implementation Phases

| Phase | Prompt | Deliverable |
|-------|--------|-------------|
| 1 | `PROMPT_11_PROJECT_FOUNDATION.md` | Schema, Project entity, convert, assignment UI draft |
| 2 | `PROMPT_12_PROJECT_MATERIAL_STOCK.md` | Delta approval, auto transfer, auto PR |
| 3 | `PROMPT_13_PROJECT_DISPATCH.md` | Projects Dispatch tab, DC, PDF |
| 4 | `PROMPT_14_PROJECT_LIFECYCLE.md` | Close, auto-return, PR fulfillment hook |

---

## 15. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Source document | Project Proposal |
| Projects WO | Jalgaon Projects (JAL-PRJ) |
| Stock priority | ISE HO → PCM HO |
| PM approval scope | Full assignment; delta re-approval on changes |
| PI relationship | B2B only; projects skip payment |
| Re-approval | Changed + new lines only |
| Project close | PM only; blocks dispatch |
| Kits | Explode like retail |
| PR linkage | Yes — project ref, proposal no., material line link |
| Search | Unified: proposal no., customer, site, project no. |

---

## 16. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-12 | Product / Ops | Initial PRD from brainstorm and clarification sessions |
