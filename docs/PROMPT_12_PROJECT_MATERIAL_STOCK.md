# Prompt 12 — Project Material Approval & Stock Transfer

Implements Phase 2 of `PRD-PROJECT-MATERIAL-DISPATCH.md`: delta PM approval, stock allocation (ISE HO → PCM HO → Jalgaon Projects), pending stock, and auto purchase request creation.

**Depends on:** Prompt 11 (Project + material lines).  
**Next prompt:** `PROMPT_13_PROJECT_DISPATCH.md`

---

## Objective

When Projects Manager approves material assignment (delta lines only), **reserve qty** at HO (ISE first, PCM fallback) — no physical transfer or serial assignment — and raise **Purchase Requests** for any short qty.

---

## Features

- Approval type `PROJECT_MATERIAL` in `ApprovalRequest`
- Submit for approval: detects **changed + new lines only**
- Approvals hub + project detail approval UI
- On approve:
  - Reserve qty from ISE Jalgaon HO first, PCM Jalgaon HO fallback (reduces B2B available)
  - Record `stockSourceLog` JSON on each line; show committed qty at JAL-PRJ
  - Short qty → line status `PENDING_STOCK` + auto PR line
- PR line links: `projectId`, `projectMaterialLineId`; remarks include `proposalNo`, `projectNo`
- PR priority `HIGH` for project-linked lines
- Merge into existing open PR for same product/company when reasonable (same warehouse target)
- Cross-company PCM use without Sales Manager approval (PM material approval sufficient)
- Project status transitions: `MATERIAL_PENDING_APPROVAL` → `MATERIAL_ASSIGNED` / `READY_FOR_DISPATCH`
- Reject returns to `MATERIAL_DRAFT`
- Audit logs on submit, approve, reject, transfer, PR create

---

## Out of Scope (later prompts)

- Projects dispatch DC (Prompt 13)
- PR fulfillment → auto transfer hook (Prompt 14)
- Project close (Prompt 14)

---

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/projects/[id]/material-assignment/submit` | Submit delta for PM approval |
| POST | `/api/projects/[id]/material-assignment/approve` | PM approve (also via approvals API) |
| POST | `/api/projects/[id]/material-assignment/reject` | PM reject |
| POST | `/api/approvals/[id]/approve` | **Extend** — handle `PROJECT_MATERIAL` |
| POST | `/api/approvals/[id]/reject` | **Extend** — handle `PROJECT_MATERIAL` |

---

## New / Modified Files

```
src/lib/project-stock-service.ts       # allocation + transfer orchestration
src/lib/project-material-service.ts    # extend: submit, approve, delta detection
src/lib/approvals-service.ts           # PROJECT_MATERIAL handler
src/lib/purchase-request-service.ts    # createProjectMaterialRequestLine()
src/components/projects/project-material-approval-panel.tsx
src/components/approvals/approval-detail-project-material.tsx
prisma/migrations/YYYYMMDD_project_material_approval/
```

---

## Implementation Steps

### Step 1 — Schema

1. Add `PROJECT_MATERIAL` to approval type enum.
2. Add to `PurchaseRequestLine`: `projectMaterialLineId`, `projectId` (optional FKs).
3. Ensure `ProjectMaterialLine.stockSourceLog` Json field exists.
4. Add `lastApprovedQty` on `ProjectMaterialLine` for delta tracking.

### Step 2 — Delta detection (`project-material-service.ts`)

```typescript
function linesNeedingApproval(lines: ProjectMaterialLine[]): ProjectMaterialLine[] {
  return lines.filter((line) =>
    line.source === "ADDED" && line.lastApprovedQty == null
    || Number(line.requiredQty) !== Number(line.lastApprovedQty ?? 0)
  );
}
```

- On submit: if no lines need approval, return error `NO_DELTA` or auto-skip (product decision: require explicit submit only when delta exists).
- Create `ApprovalRequest` with JSON payload listing line snapshots.

### Step 3 — Approval UI

1. Approvals list: show type **Project Material Approval** with projectNo, proposalNo, customer.
2. Detail view: table of delta lines (product, old qty → new qty, source badge).
3. Unchanged approved lines: collapsed read-only section.

### Step 4 — Stock allocation (`project-stock-service.ts`)

For each approved line (use approved qty = `requiredQty`):

1. `remaining = requiredQty - assignedQty` (fulfill incremental on re-approval).
2. Query available stock at ISE JAL-HO for product (respect serial vs non-serial rules from inventory-service).
3. Take min(remaining, availIse) → log `{ companyId: ISE, warehouseId, qty }`.
4. Query PCM JAL-HO for remainder.
5. Take min(remaining, availPcm) → log PCM source.
6. Queue transfers:
   - Same pattern as manual transfer create + dispatch + receive in one transaction
   - Use `transfer-service.ts`; add helper `autoTransferToProjectWarehouse()`
7. Update `assignedQty` += transferred qty.
8. If remaining > 0: set `PENDING_STOCK`; call `createProjectMaterialPurchaseRequest()`.

### Step 5 — Auto Purchase Request

1. Create PR if none open for project, else append line.
2. Line fields: productId, requestedQty = remaining, priority HIGH, remarks = `Project {projectNo} / Proposal {proposalNo} / Line {lineId}`.
3. Set `ProjectMaterialLine.purchaseRequestLineId`.
4. Notify Purchase Manager (use `notification-service` if available).

### Step 6 — Cross-company

1. When allocating from PCM, use `cross-company-transfer-service.ts` patterns.
2. **Do not** create `CROSS_COMPANY_TRANSFER` SM approval — gate already passed via `PROJECT_MATERIAL`.

### Step 7 — Status updates

| Condition | Project status |
|-----------|----------------|
| Submit delta | `MATERIAL_PENDING_APPROVAL` |
| Approve, all lines have assignedQty = requiredQty | `READY_FOR_DISPATCH` |
| Approve, some PENDING_STOCK | `MATERIAL_ASSIGNED` |
| Approve, some assigned, none dispatchable yet | `MATERIAL_ASSIGNED` |

Line status:
- Full assigned → `ASSIGNED`
- Partial → `PENDING_STOCK` if short else `ASSIGNED`
- Update `lastApprovedQty = requiredQty` on approve

### Step 8 — Material form updates

1. Show Assigned / Balance columns live.
2. **Submit for Approval** button enabled when delta exists and status is `MATERIAL_DRAFT` or after edits post-approval.
3. Badges: Pending Stock, In Projects WH.

### Step 9 — Tests

- `project-material-service.test.ts` — delta detection
- `project-stock-service.test.ts` — ISE first, PCM fallback, partial PR
- Integration test: approve with insufficient stock creates PR link

---

## Permissions

| Action | Roles |
|--------|-------|
| Submit for approval | Projects Manager, Super Admin |
| Approve / reject material | Projects Manager, Super Admin |
| View approval | Projects Manager, Super Admin, Admin |

---

## Validation Rules

- Cannot submit when project `CLOSED`
- Cannot submit empty assignment
- PM cannot approve own submit if segregation required — **optional**: allow same user for MVP (small team)
- Transfer qty cannot exceed available at source
- assignedQty + pendingQty must reconcile to requiredQty after approve

---

## Database migration

```bash
npm run db:migrate
```

Seed: project with partial stock scenario (some lines short → PR created).

---

## Workflow (manual test)

1. Open converted project with material lines.
2. Add one **Added Line**; increase qty on one proposal line.
3. Submit for approval → appears in Approvals.
4. Approve → verify transfer records HO → Jalgaon Projects.
5. Verify short line shows **Pending Stock** + PR created with project/proposal refs.
6. Re-submit with only a new added line → unchanged lines not in approval payload.

---

## Acceptance Checklist

- [ ] Delta-only approval works
- [ ] ISE HO consumed before PCM HO
- [ ] Auto transfer to Jalgaon Projects on approve
- [ ] stockSourceLog populated per line
- [ ] Auto PR created for short qty with correct links
- [ ] Project status updates correctly
- [ ] Re-approval only for changed/new lines

---

## Next prompt

Prompt 13 — Projects Dispatch tab, DC create/confirm, PDF with "Project Dispatch" header.
