# Prompt 11 — Project Foundation (Convert + Material Assignment Draft)

Implements Phase 1 of `PRD-PROJECT-MATERIAL-DISPATCH.md`: Project entity, enhanced convert, projects list/detail, and material assignment draft UI with default proposal lines.

**Depends on:** Existing project proposals module (`PROMPT` proposals flow), products, warehouses, RBAC.  
**Next prompt:** `PROMPT_12_PROJECT_MATERIAL_STOCK.md`

---

## Objective

Replace "convert = status flag only" with a real **Project** execution record and a **Material Assignment** screen that defaults lines from the approved proposal revision.

---

## Features

- Prisma models: `Project`, `ProjectMaterialAssignment`, `ProjectMaterialLine` + enums (`ProjectStatus`, `ProjectMaterialLineSource`, `ProjectMaterialLineStatus`)
- Extend `convertProjectProposalToProject()` to create Project + empty assignment + seed lines from BOM resolver
- `ProjectProposal.projectId` back-link (1:1)
- Project numbering: `PRJ-{FY}-{SEQUENCE}` via `DocumentSequence`
- Projects list page with filters and unified search
- Project detail with sections: **Project Overview** | **Material Assignment**
- Material grid: default lines, **Add Row** (mirror `quotation-form.tsx` pattern), edit qty, remove added lines
- Save draft → project status `MATERIAL_DRAFT`
- Proposal detail **Project Handoff** section: Convert CTA + link when converted
- RBAC: Projects Manager + Super Admin for convert/edit
- Audit logs on convert, line add/edit/delete

---

## Out of Scope (later prompts)

- PM approval workflow and stock transfer (Prompt 12)
- Projects dispatch tab (Prompt 13)
- Project close and auto-return (Prompt 14)
- Auto purchase requests (Prompt 12)

---

## Routes

| Route | Purpose |
|-------|---------|
| `/projects` | Projects list (execution projects, not proposals) |
| `/projects/[id]` | Project detail + material assignment |
| `/projects/proposals/[id]` | Existing — add Project Handoff section |

---

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects` | List projects (search, filters) |
| GET | `/api/projects/[id]` | Project detail + assignment lines |
| POST | `/api/project-proposals/[id]/convert` | **Extend** — create Project (existing route) |
| GET | `/api/projects/[id]/material-assignment` | Get assignment + lines |
| POST | `/api/projects/[id]/material-assignment/lines` | Add row |
| PATCH | `/api/projects/[id]/material-assignment/lines/[lineId]` | Update qty / remarks |
| DELETE | `/api/projects/[id]/material-assignment/lines/[lineId]` | Remove added line (if not dispatched) |
| PUT | `/api/projects/[id]/material-assignment` | Save draft metadata |

---

## New Files

```
src/lib/project-service.ts
src/lib/project-material-service.ts
src/lib/project-material-bom.ts
src/lib/project-permissions.ts
src/components/projects/project-list.tsx
src/components/projects/project-detail.tsx
src/components/projects/project-material-form.tsx
src/app/(app)/projects/page.tsx          # update — tabs or sub-nav: Proposals | Projects
src/app/(app)/projects/[id]/page.tsx
src/app/api/projects/route.ts
src/app/api/projects/[id]/route.ts
src/app/api/projects/[id]/material-assignment/...
prisma/migrations/YYYYMMDD_project_foundation/
```

---

## Implementation Steps

### Step 1 — Schema migration

1. Add enums and models per `IMPLEMENTATION-MAP-PROJECT-MATERIAL-DISPATCH.md`.
2. Add optional `projectId` on `ProjectProposal` (unique).
3. Run `npm run db:migrate`.

### Step 2 — BOM resolver (`project-material-bom.ts`)

1. Input: current `ProjectProposalRevision` + package/module/inverter fields.
2. Output: `{ productId, qty, source: PROPOSAL, sortOrder }[]`.
3. Reuse logic from `proposal-bom.ts` and map display names to `Product` records (moduleProductId direct; inverter/structure via category/product lookup tables or package master extension).
4. Add Vitest coverage for at least 3 package variants (DCR base, with NDCR add-on, with inverter upgrade).

### Step 3 — Extend convert (`project-proposal-service.ts`)

1. After setting proposal `CONVERTED`, call `createProjectFromProposal()`:
   - Resolve JAL-PRJ warehouse for ISE company
   - Generate `projectNo`
   - Copy customer fields from revision
   - Create `ProjectMaterialAssignment` + lines from BOM resolver
   - Set project status `OPEN` then `MATERIAL_DRAFT` if lines seeded
2. Return serialized proposal **and** `projectId` / `projectNo` in API response.

### Step 4 — Project list UI

1. Columns: Project No, Proposal No, Customer, Site, Status, Created.
2. Search matches: `projectNo`, `proposalNo`, `customerName`, `siteAddress` (case-insensitive).
3. Status filter dropdown with UI headings from PRD §7.2.

### Step 5 — Material assignment form

1. Clone interaction patterns from `src/components/quotations/quotation-form.tsx`:
   - Product select with search
   - Qty input
   - **Add Row** button
   - Remove row (added lines only)
2. Columns: Product | Source badge | Required Qty | Assigned (0) | Dispatched (0) | Balance | Status.
3. Disable Assigned/Dispatched columns in Phase 1 (show 0) or hide until Prompt 12.
4. Block edit when project status = `CLOSED` (future-proof).

### Step 6 — Proposal detail handoff

1. In `project-proposal-detail.tsx`, add **Project Handoff** card:
   - If `APPROVED`: **Convert to Project** (existing button — update success redirect to `/projects/[id]`)
   - If `CONVERTED`: link to project, converted date/user

### Step 7 — RBAC

1. Update `src/lib/rbac.ts` nav: Projects → Proposals, Enquiries, **Projects (Execution)**.
2. Add `canViewProjects`, `canEditProjectMaterial`, `canConvertProposal` helpers.

### Step 8 — Seed data

1. Add one converted project with 3–5 material lines in `prisma/seed.ts` for QA.

---

## Permissions

| Action | Roles |
|--------|-------|
| View projects list/detail | Super Admin, Admin, Projects Manager |
| Convert proposal | Super Admin, Projects Manager |
| Add/edit/delete material lines | Super Admin, Projects Manager |
| View proposals (existing) | Unchanged |

---

## Validation Rules

- Convert only when proposal status = `APPROVED`
- Cannot convert twice (`ALREADY_CONVERTED`)
- Material line qty > 0
- Product required on each line
- Cannot delete `PROPOSAL` source lines in Phase 1 (only qty edit); can delete `ADDED` lines if `dispatchedQty = 0`

---

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

---

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Projects Manager | (seed PM user) | (seed password) |
| Super Admin | admin@ivaansolar.com | Admin@123 |

---

## Acceptance Checklist

- [ ] Convert creates Project with unique projectNo
- [ ] Proposal shows CONVERTED + link to project
- [ ] Material lines pre-filled from proposal
- [ ] Add Row adds catalogue product line
- [ ] Qty edit persists on save
- [ ] Projects list search finds by customer name
- [ ] Audit log on convert and line changes

---

## Next prompt

Prompt 12 — Material approval (delta), auto stock transfer ISE→PCM→JAL-PRJ, auto purchase requests.
