# Prompt 11–14 — Manual QA Checklist (Project Material & Dispatch)

**PRD:** `docs/PRD-PROJECT-MATERIAL-DISPATCH.md`  
**Prompts:** 11 (Foundation), 12 (Material/Stock), 13 (Dispatch), 14 (Lifecycle)

---

## Setup

- [ ] `npm run db:migrate` applies all project migrations (11–14)
- [ ] `npm run db:seed` includes sample proposal, converted project, assignment lines
- [ ] `npm run dev` starts successfully
- [ ] Log in as Projects Manager and Warehouse users

---

## Prompt 11 — Foundation

### Convert to Project

- [ ] Approved proposal shows **Convert to Project** in Project Handoff section
- [ ] Non-approved proposal cannot convert
- [ ] Convert creates Project with unique `projectNo` (PRJ-… format)
- [ ] Proposal status becomes **Converted to Project**
- [ ] Link from proposal to project works
- [ ] Already converted proposal shows error on second convert attempt
- [ ] Audit log entry recorded for convert

### Projects List

- [ ] `/projects` shows execution projects (distinct from proposals list)
- [ ] Search by customer name finds project
- [ ] Search by proposal no. finds project
- [ ] Search by site name finds project
- [ ] Search by project no. finds project
- [ ] Status filter works with UI headings (Project Open, Material Draft, etc.)

### Material Assignment Draft

- [ ] Default lines populated from proposal BOM/products
- [ ] Lines show **From Proposal** badge
- [ ] **Add Row** adds product + qty (same UX feel as quotation Add Row)
- [ ] Added line shows **Added Line** badge
- [ ] Can edit qty on proposal lines
- [ ] Can delete added lines (not yet dispatched)
- [ ] Cannot delete proposal source lines
- [ ] Save draft persists changes
- [ ] Project status shows **Material Assignment (Draft)**

---

## Prompt 12 — Material Approval & Stock

### Delta Approval

- [ ] **Submit for Approval** sends only changed + new lines
- [ ] Unchanged previously approved lines do not appear in approval queue
- [ ] Approval type shows **Project Material Approval**
- [ ] Approval detail shows old qty → new qty for revised lines
- [ ] PM can approve from Approvals hub
- [ ] PM can reject — project returns to draft
- [ ] Re-submit after rejection works for corrected delta

### Stock Transfer

- [ ] On approve, ISE Jalgaon HO stock used first
- [ ] PCM Jalgaon HO used when ISE insufficient
- [ ] Transfer records created HO → Jalgaon Projects
- [ ] Assigned qty updated on lines
- [ ] Lines show **In Projects WH** when fully assigned
- [ ] `stockSourceLog` reflects ISE vs PCM split
- [ ] No Sales Manager approval prompt for PCM fallback
- [ ] Project status updates to Material Assigned or Ready for Dispatch

### Pending Stock & Purchase Request

- [ ] PM can approve when stock insufficient
- [ ] Short lines show **Pending Stock** badge
- [ ] Purchase Request auto-created with HIGH priority
- [ ] PR line links to project and proposal no. in remarks/detail
- [ ] Project detail shows linked PR
- [ ] Audit log on approve, transfer, PR create

### Re-approval Cycle

- [ ] After first approval, add new line and submit — only new line in approval
- [ ] Increase qty on approved line — only that line in approval
- [ ] Unchanged lines remain approved without re-submission

---

## Prompt 13 — Projects Dispatch

### UI & Navigation

- [ ] Inventory → Dispatches shows **Retail Dispatch** and **Projects Dispatch** tabs
- [ ] Retail dispatch behaviour unchanged from before
- [ ] Projects tab lists projects with dispatchable stock
- [ ] Unified search works (customer, proposal no., site, project no.)

### Create & Confirm DC

- [ ] Warehouse user can create project dispatch
- [ ] Projects Manager can create project dispatch
- [ ] Form shows balance qty per line
- [ ] Partial dispatch qty accepted (less than balance)
- [ ] Cannot dispatch more than balance
- [ ] Serial required for panel/inverter products
- [ ] Bulk products dispatch by qty only
- [ ] Kit product explodes to components on confirm
- [ ] Confirm deducts Jalgaon Projects stock
- [ ] Line dispatched qty and balance update correctly
- [ ] Project status → Partially Dispatched when applicable
- [ ] Second DC can ship remaining balance
- [ ] Project status → Fully Dispatched when all lines complete

### PDF & History

- [ ] PDF header reads **Project Dispatch**
- [ ] PDF shows project no., proposal no., customer, site
- [ ] PDF lists serial numbers where applicable
- [ ] Project detail shows Dispatch History with DC links

### Closed Project Guard (with Prompt 14)

- [ ] Cannot create/confirm dispatch for closed project

---

## Prompt 14 — Lifecycle

### Manual Return

- [ ] **Return to HO** available on lines with balance in Jalgaon Projects
- [ ] Return qty reduces assigned qty
- [ ] Source HO stock increases (ISE or PCM per log)
- [ ] Warehouse and PM can perform return
- [ ] Audit log on manual return

### Close Project

- [ ] **Close Project** visible to Projects Manager only
- [ ] Super Admin can also close
- [ ] Other roles cannot close
- [ ] Close blocked or allowed with confirmation when draft DC exists (per spec: cancel drafts)
- [ ] After close, new project dispatch blocked immediately
- [ ] Unused qty auto-returned from Jalgaon Projects to source HO
- [ ] Project status **Project Closed**
- [ ] Material assignment read-only after close
- [ ] Audit log summarizes auto-return

### PR Fulfillment Hook

- [ ] Receive incoming stock against linked PR line
- [ ] System auto-transfers fulfilled qty to Jalgaon Projects
- [ ] Material line assigned qty increases
- [ ] Pending Stock clears when fully fulfilled
- [ ] Project becomes Ready for Dispatch when stock available
- [ ] PM receives notification (if notifications enabled)

---

## Regression — Unchanged Flows

- [ ] B2B Quotation → PI → booking → retail dispatch still works
- [ ] Proposal discount approval (PROJECT_PROPOSAL) unchanged
- [ ] Manual inventory transfers still work
- [ ] Existing retail DC PDF unchanged
- [ ] Purchase requests not linked to projects behave as before

---

## Permissions Summary

- [ ] Sales Executive cannot access project material assignment
- [ ] Sales Executive cannot access projects dispatch tab
- [ ] Warehouse cannot close project
- [ ] Warehouse cannot approve material
- [ ] Purchase Manager can view linked PRs but not dispatch

---

## Mobile / Responsive

- [ ] Projects list usable on mobile width
- [ ] Material assignment grid scrolls horizontally if needed
- [ ] Projects dispatch form usable on tablet

---

## Sign-off

| Phase | Tester | Date | Pass/Fail |
|-------|--------|------|-----------|
| Prompt 11 | | | |
| Prompt 12 | | | |
| Prompt 13 | | | |
| Prompt 14 | | | |
| Regression | | | |
