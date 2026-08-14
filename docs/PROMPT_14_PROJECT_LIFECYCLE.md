# Prompt 14 — Project Lifecycle (Close, Auto-Return, PR Fulfillment)

Implements Phase 4 of `PRD-PROJECT-MATERIAL-DISPATCH.md`: PM-only project close, block new dispatches, auto-return unused stock to source warehouses, optional manual return, and purchase request fulfillment hook.

**Depends on:** Prompts 11–13 (full project execution path).

---

## Objective

Complete the project lifecycle: when Projects Manager closes a project, stop further dispatch activity and return any remaining staged material from Jalgaon Projects to the original source warehouses (ISE/PCM HO per `stockSourceLog`). When purchase requests linked to project lines are fulfilled, automatically transfer stock into Jalgaon Projects.

---

## Features

- **Close Project** action (PM + Super Admin only)
- Immediate block on new project DC create/confirm when `CLOSED`
- Auto-return unused qty: `assignedQty - dispatchedQty` per line from JAL-PRJ → sources in `stockSourceLog` (pro-rata or LIFO per source entry — implement pro-rata by qty)
- Optional **Manual Return** before close (Warehouse + PM)
- PR fulfillment hook: when incoming lot closes against linked `purchaseRequestLineId`, auto-transfer fulfilled qty to JAL-PRJ and update line assigned qty / clear `PENDING_STOCK`
- Project detail: **Linked Purchase Requests** section
- Purchase request detail: show project + proposal refs when linked
- Notifications to PM when pending stock becomes assigned
- Audit logs on close, return, fulfillment transfer

---

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/projects/[id]/close` | Close project + auto-return |
| POST | `/api/projects/[id]/return-stock` | Manual return qty to HO |
| POST | `/api/purchase-requests/[id]/fulfill-hook` | Internal/called from incoming — **prefer inline hook in incoming service** |

---

## Modified Files

```
src/lib/project-service.ts              # closeProject(), returnStock()
src/lib/project-stock-service.ts        # autoReturnOnClose(), fulfillPendingFromPr()
src/lib/purchase-request-service.ts     # call fulfillment hook on line fulfill
src/lib/inventory-service.ts            # or incoming lot receive — trigger hook
src/components/projects/project-detail.tsx
src/components/projects/project-close-dialog.tsx
src/components/purchase/purchase-request-detail.tsx  # show project link
```

---

## Implementation Steps

### Step 1 — Close project (`closeProject`)

**Preconditions:**
- Actor has `canCloseProject` (Projects Manager, Super Admin)
- Project status ≠ `CLOSED`

**Actions (single transaction):**

1. Set `status = CLOSED`, `closedAt`, `closedById`.
2. Cancel any **draft** project DCs (set cancelled) — do not auto-cancel already DISPATCHED DCs.
3. For each material line with balance = `assignedQty - dispatchedQty > 0`:
   - Read `stockSourceLog`: `[{ companyId, warehouseId, qty }]`
   - Compute return qty pro-rata across sources based on original allocation proportions
   - Create transfers JAL-PRJ → source HO (dispatch + receive auto)
   - Reduce `assignedQty` by returned qty
4. Write audit log with summary of returned products/qty.
5. Optional notification to Warehouse.

**Postcondition:** No dispatchable balance remains in JAL-PRJ for this project (except rounding — handle epsilon).

### Step 2 — Block dispatch on closed project

In `project-dispatch-service.ts` create/confirm:

```typescript
if (project.status === "CLOSED") throw new Error("PROJECT_CLOSED");
```

Return 400 with clear message on API.

### Step 3 — Manual return (`returnStock`)

**Input:** `{ lineId, qty, remarks? }`

**Rules:**
- `qty ≤ assignedQty - dispatchedQty`
- Reduce assignedQty; transfer JAL-PRJ → sources using same pro-rata from stockSourceLog
- Audit log

UI: per-line **Return to HO** action on project detail (Warehouse + PM).

### Step 4 — PR fulfillment hook

**Trigger point:** When `PurchaseRequestLine.fulfilledQty` increases (incoming lot received/linked) — extend existing purchase/incoming flow.

**Logic (`fulfillPendingFromPr`):**

1. Load `ProjectMaterialLine` by `purchaseRequestLineId`.
2. `newFulfillment = fulfilledQty - previouslyRecordedFulfillmentForProject` (track via line metadata or compare assigned delta).
3. For `newFulfillment` qty:
   - Transfer from receiving warehouse (typically HO after incoming) → JAL-PRJ
   - Increase `assignedQty` on material line
4. If `assignedQty >= requiredQty`: clear `PENDING_STOCK`, set line `ASSIGNED`
5. Update project status toward `READY_FOR_DISPATCH` if any dispatchable balance
6. Notify Projects Manager

**Idempotency:** Use transaction + check fulfilled qty monotonic increase.

### Step 5 — Linked PR UI

**Project detail — Linked Purchase Requests:**
- Table: PR No | Product | Requested | Fulfilled | Status | Link

**Purchase request detail:**
- Banner: "Created from Project Material" with links to `/projects/[id]` and proposal no.

### Step 6 — Ongoing assignment cycles

Ensure close is the only terminal state. Before close:
- PM can still add lines and run delta approval (Prompt 12) even if `PARTIALLY_DISPATCHED`
- After close: material assignment read-only

### Step 7 — Tests

- `project-service.test.ts`: close returns correct qty to ISE vs PCM per stockSourceLog
- `project-stock-service.test.ts`: PR fulfillment updates assigned qty
- Dispatch blocked after close

---

## Permissions

| Action | Roles |
|--------|-------|
| Close project | Projects Manager, Super Admin |
| Manual return | Warehouse, Projects Manager, Super Admin |
| View linked PRs | Projects Manager, Purchase Manager, Super Admin |

---

## Validation Rules

- Cannot close twice
- Cannot return more than balance
- Cannot dispatch after close
- PR hook ignores lines not linked to project material

---

## Edge Cases

| Case | Handling |
|------|----------|
| Close with all qty already dispatched | Close allowed; no returns |
| Close with pending PR (stock never arrived) | Close allowed; PR remains open but line flagged "project closed" in remarks |
| Partial manual return then close | Close returns only remaining balance |
| stockSourceLog empty (legacy data) | Return to ISE JAL-HO as default fallback + audit warning |

---

## Workflow (manual test)

1. Project with partial dispatch and remaining balance in JAL-PRJ.
2. Manual return 2 units of one line → verify HO stock increased.
3. Close project → remaining balance auto-returned.
4. Attempt new project DC → blocked.
5. Separate project with PENDING_STOCK line → receive incoming against PR → verify auto transfer to JAL-PRJ and line becomes ASSIGNED.

---

## Acceptance Checklist

- [ ] Only PM can close project
- [ ] New dispatch blocked immediately after close
- [ ] Auto-return uses stockSourceLog sources correctly
- [ ] Manual return works before close
- [ ] PR fulfillment triggers transfer to Jalgaon Projects
- [ ] Linked PRs visible on project and PR detail
- [ ] Audit trail complete

---

## Documentation complete

After Prompt 14, run full QA: `docs/PROMPT_11-14_QA_CHECKLIST.md`

Reference PRD: `docs/PRD-PROJECT-MATERIAL-DISPATCH.md`
