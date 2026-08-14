# Prompt 13 — Projects Dispatch & Delivery Challan

Implements Phase 3 of `PRD-PROJECT-MATERIAL-DISPATCH.md`: Projects Dispatch tab under Inventory → Dispatches, partial dispatch to site, kit explosion, serial rules, and project DC PDF.

**Depends on:** Prompt 11 (Project), Prompt 12 (stock in Jalgaon Projects).  
**Next prompt:** `PROMPT_14_PROJECT_LIFECYCLE.md`

---

## Objective

Enable Warehouse and Projects Manager to dispatch material from **Jalgaon Projects** to the customer site with the same operational rigor as retail DC — including partial shipments, serial scanning for panels/inverters, and a clearly labelled **Project Dispatch** challan.

---

## Features

- Prisma: `ProjectDispatch`, `ProjectDispatchLine`, `ProjectDispatchLineSerial`
- Dispatch numbering: `ISE-PDC-{FY}-{SEQUENCE}` (or `{COMPANY}-PDC-...`)
- Inventory → Dispatches page: tabs **Retail Dispatch** | **Projects Dispatch**
- Projects dispatch queue: searchable list (proposal no., customer name, site name, project no.)
- Project dispatch form (reuse patterns from `dispatch-form.tsx`)
- Partial dispatch: `Dispatch Now` qty ≤ balance in JAL-PRJ
- Kit products explode via `kit-fulfillment.ts` / `loadKitBomMap`
- Serial scan: required for panel/inverter categories; qty-only for bulk
- Confirm DC: deduct JAL-PRJ stock, update `ProjectMaterialLine.dispatchedQty`, project status
- PDF: header **"Project Dispatch"**, show projectNo, proposalNo, customer, site, lines, serials
- Multiple DCs per project allowed
- Block dispatch when project status = `CLOSED`
- Audit logs on create, confirm

---

## Routes

| Route | Purpose |
|-------|---------|
| `/inventory/dispatches` | Add tab switch: Retail \| Projects |
| `/inventory/dispatches/projects` | Optional dedicated route; or tab panel on same page |
| `/inventory/dispatches/projects/new?projectId=` | Create project DC |
| `/inventory/dispatches/projects/[id]` | View / confirm / PDF |

---

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/project-dispatches/dispatchable` | List projects/lines ready to dispatch |
| GET/POST | `/api/project-dispatches` | List / create draft project DC |
| GET | `/api/project-dispatches/[id]` | DC detail |
| POST | `/api/project-dispatches/[id]/confirm` | Confirm DC, deduct stock |
| GET | `/api/project-dispatches/[id]/pdf` | Generate PDF |
| GET | `/api/project-dispatches/serials` | Available serials in JAL-PRJ for line |
| GET | `/api/project-dispatches/lookup-serial` | Scan serial by number |

---

## New / Modified Files

```
src/lib/project-dispatch-service.ts
src/lib/project-dispatch-pdf.ts
src/lib/validations.ts                    # Zod schemas for project dispatch
src/components/inventory/dispatch-projects-panel.tsx
src/components/projects/project-dispatch-form.tsx
src/components/projects/project-dispatch-detail.tsx
src/app/(app)/inventory/dispatches/page.tsx # tabs
src/app/(app)/inventory/dispatches/projects/...
src/app/api/project-dispatches/...
prisma/migrations/YYYYMMDD_project_dispatch/
```

---

## Implementation Steps

### Step 1 — Schema migration

Create `ProjectDispatch*` models per implementation map. Index by `projectId`, `status`, `dispatchNo`.

### Step 2 — Dispatchable queue (`GET dispatchable`)

Return projects where:
- status in (`READY_FOR_DISPATCH`, `PARTIALLY_DISPATCHED`, `MATERIAL_ASSIGNED`)
- not `CLOSED`
- at least one line with `assignedQty - dispatchedQty > 0`

Include for search: `projectNo`, `proposal.proposalNo`, `customerName`, `siteAddress`.

Single search param `q` matches any of the above (ilike).

List columns: Customer | Project No | Proposal No | Site | Ready Lines | Dispatch Status.

### Step 3 — Create draft DC

1. Select project → load lines with balance > 0.
2. For kit lines on material assignment: show kit row; on confirm explode to components (mirror `dispatch-service.ts`).
3. Form fields: vehicleNo, receiverName, receiverMobile, remarks, signature (optional on draft).
4. Per line: balance qty, dispatch qty input default 0.
5. Validate: sum dispatch qty ≤ balance; serial lines require serial selection when qty > 0.

### Step 4 — Confirm dispatch (`project-dispatch-service.ts`)

Follow `dispatch-service.ts` confirm flow adapted for projects:

1. Verify project not `CLOSED`.
2. Deduct stock from JAL-PRJ (non-serial qty + serial status updates).
3. Update each `ProjectMaterialLine.dispatchedQty`.
4. Update line status: `PARTIALLY_DISPATCHED` or `FULLY_DISPATCHED`.
5. Update project status:
   - Any line partial → `PARTIALLY_DISPATCHED`
   - All lines fully dispatched → `FULLY_DISPATCHED`
6. Set dispatch status `DISPATCHED`, `dispatchedAt = now()`.
7. Write inventory transactions / ledger entries consistent with retail dispatch.
8. Audit log.

### Step 5 — Serial rules

Reuse category or product flags from retail dispatch:
- **Serial required:** Solar Module, Inverter (match existing dispatch serial logic)
- **Qty only:** cables, structures, consumables

Expose serial picker + barcode lookup endpoints scoped to JAL-PRJ warehouse.

### Step 6 — Kit explosion

1. If material line product is kit, load BOM via `loadKitBomMap`.
2. Dispatch confirm allocates component products from JAL-PRJ.
3. Store `kitProductId`, `kitProductName`, `kitBomQty` on `ProjectDispatchLine` (mirror `DispatchLine` fields).

### Step 7 — PDF (`project-dispatch-pdf.ts`)

Based on `dispatch-pdf.ts`:

- Title: **PROJECT DISPATCH / DELIVERY CHALLAN**
- Subtitle block: Project No, Proposal No, Customer, Site Address
- Warehouse: Jalgaon Projects
- Line table with qty and serials
- Footer: receiver signature area, vehicle no, date

### Step 8 — UI tab integration

Update `src/app/(app)/inventory/dispatches/page.tsx`:

```tsx
// Tab 1: Retail — existing DispatchTodayPanel + challan archive link
// Tab 2: Projects — DispatchProjectsPanel
```

Preserve existing retail behaviour unchanged.

### Step 9 — Project detail dispatch history

On `/projects/[id]`, add **Dispatch History** section listing project DCs with links to detail/PDF.

### Step 10 — RBAC

| Action | Roles |
|--------|-------|
| View projects dispatch queue | Super Admin, Admin, Warehouse, Projects Manager |
| Create / confirm project DC | Super Admin, Warehouse, Projects Manager |
| View serials | Super Admin, Warehouse |

---

## Validation Rules

- `dispatchQty > 0` for at least one line to confirm
- `dispatchQty ≤ assignedQty - dispatchedQty` per line
- Project must not be `CLOSED`
- Serial count must match dispatch qty for serial-tracked products
- Kit components must all have sufficient stock in JAL-PRJ

---

## Database migration

```bash
npm run db:migrate
npm run db:seed   # optional: sample project DC draft
```

---

## Workflow (manual test)

1. Ensure project has assigned stock in Jalgaon Projects (Prompt 12).
2. Open **Inventory → Dispatches → Projects Dispatch**.
3. Search customer name → open project.
4. Create DC with partial qty on one line.
5. Scan/select serials for inverter line.
6. Confirm → stock reduced at JAL-PRJ; line shows partial dispatch.
7. Download PDF — verify **Project Dispatch** header and proposal ref.
8. Create second DC for remaining balance → project moves to fully dispatched when complete.

---

## Acceptance Checklist

- [ ] Retail and Projects tabs both work; retail unchanged
- [ ] Unified search finds project by customer, proposal no., site
- [ ] Partial dispatch updates balances correctly
- [ ] Kit explosion works
- [ ] Serial rules enforced for panels/inverters
- [ ] PDF labelled Project Dispatch with project + proposal refs
- [ ] Cannot dispatch closed project
- [ ] Warehouse and PM can both confirm DC

---

## Next prompt

Prompt 14 — Project close, auto-return unused stock, PR fulfillment hook.
