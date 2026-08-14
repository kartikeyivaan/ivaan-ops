# Implementation Map — Project Material Assignment & Projects Dispatch

**Source PRD:** `docs/PRD-PROJECT-MATERIAL-DISPATCH.md`  
**Scope:** Discovery and mapping — reference before Prompts 11–14  
**Audit date:** 2026-08-12

---

## 1. Current Architecture (unchanged)

| Layer | Choice |
|--------|--------|
| Framework | Next.js App Router (`src/app/`) |
| UI | React, Tailwind, Radix, lucide-react |
| Forms | react-hook-form + Zod (`src/lib/validations.ts`) |
| ORM | Prisma → PostgreSQL |
| Auth | NextAuth v5 + RBAC (`src/lib/rbac.ts`) |
| Pattern | Page → `fetch('/api/...')` → Route Handler → `*-service.ts` → Prisma + audit |

---

## 2. Existing vs New Mapping

| PRD concept | Existing today | Action |
|-------------|----------------|--------|
| Project Proposal | `ProjectProposal`, `ProjectProposalRevision` | Reuse |
| Convert to project | `convertProjectProposalToProject()` — status flag only | **Extend** — create `Project` |
| Proposal BOM | `src/lib/proposal-bom.ts` | **Reuse** — add product resolver |
| Project (execution) | — | **Create** |
| Material assignment | — | **Create** |
| Jalgaon Projects WH | `Warehouse` JAL-PRJ (ISE) | Reuse |
| ISE / PCM HO | `Warehouse` JAL-HO per company | Reuse |
| Stock transfer | `InventoryTransfer`, `transfer-service.ts` | Reuse for auto HO → PRJ |
| Cross-company stock | `cross-company-transfer-service.ts` | Reuse; skip SM when `PROJECT_MATERIAL` approved |
| Purchase Request | `PurchaseRequest`, `purchase-request-service.ts` | **Extend** with project links |
| Approvals | `ApprovalRequest` | **Extend** — `PROJECT_MATERIAL` |
| Retail dispatch | `Dispatch`, `dispatch-service.ts` | Reuse patterns; add project dispatch |
| Kit BOM | `kit-fulfillment.ts` | Reuse |
| Document sequences | `DocumentSequence` | **Extend** — projectNo, PDC numbers |

---

## 3. Proposed Schema (Prisma)

### 3.1 Enums

```prisma
enum ProjectStatus {
  OPEN
  MATERIAL_DRAFT
  MATERIAL_PENDING_APPROVAL
  MATERIAL_ASSIGNED
  READY_FOR_DISPATCH
  PARTIALLY_DISPATCHED
  FULLY_DISPATCHED
  CLOSED
}

enum ProjectMaterialLineSource {
  PROPOSAL
  ADDED
}

enum ProjectMaterialLineStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  PENDING_STOCK
  ASSIGNED
  PARTIALLY_DISPATCHED
  FULLY_DISPATCHED
}

enum ProjectDispatchStatus {
  DRAFT
  DISPATCHED
  CANCEL_PENDING
  CANCELLED
}

// Extend ApprovalRequestType enum:
// PROJECT_MATERIAL
```

### 3.2 Models

```prisma
model Project {
  id              String        @id @default(uuid()) @db.Uuid
  projectNo       String        @unique @map("project_no")
  companyId       String        @map("company_id") @db.Uuid
  proposalId      String        @unique @map("proposal_id") @db.Uuid
  revisionId      String        @map("revision_id") @db.Uuid
  warehouseId     String        @map("warehouse_id") @db.Uuid  // JAL-PRJ
  customerName    String        @map("customer_name")
  customerMobile  String        @map("customer_mobile")
  siteAddress     String        @map("site_address")
  status          ProjectStatus
  closedAt        DateTime?     @map("closed_at")
  closedById      String?       @map("closed_by") @db.Uuid
  createdById     String        @map("created_by") @db.Uuid
  updatedById     String        @map("updated_by") @db.Uuid
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  company      Company       @relation(...)
  proposal     ProjectProposal @relation(...)
  warehouse    Warehouse     @relation(...)
  assignment   ProjectMaterialAssignment?
  dispatches   ProjectDispatch[]
  purchaseRequestLines PurchaseRequestLine[]
  closedBy     User?         @relation(...)
  createdBy    User          @relation(...)
  updatedBy    User          @relation(...)

  @@index([companyId, status])
  @@index([customerName])
  @@map("projects")
}

model ProjectMaterialAssignment {
  id           String   @id @default(uuid()) @db.Uuid
  projectId    String   @unique @map("project_id") @db.Uuid
  submittedAt  DateTime? @map("submitted_at")
  approvedAt   DateTime? @map("approved_at")
  approvedById String?  @map("approved_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  project  Project               @relation(...)
  lines    ProjectMaterialLine[]
  approvedBy User?               @relation(...)

  @@map("project_material_assignments")
}

model ProjectMaterialLine {
  id                    String                    @id @default(uuid()) @db.Uuid
  assignmentId          String                    @map("assignment_id") @db.Uuid
  productId             String                    @map("product_id") @db.Uuid
  source                ProjectMaterialLineSource
  requiredQty           Decimal                   @map("required_qty") @db.Decimal(12, 3)
  assignedQty           Decimal                   @default(0) @map("assigned_qty") @db.Decimal(12, 3)
  dispatchedQty         Decimal                   @default(0) @map("dispatched_qty") @db.Decimal(12, 3)
  approvedQty           Decimal                   @default(0) @map("approved_qty") @db.Decimal(12, 3)
  lineStatus            ProjectMaterialLineStatus @map("line_status")
  sortOrder             Int                       @default(0) @map("sort_order")
  stockSourceLog        Json?                     @map("stock_source_log")
  purchaseRequestLineId String?                   @unique @map("purchase_request_line_id") @db.Uuid
  lastApprovedQty       Decimal?                  @map("last_approved_qty") @db.Decimal(12, 3)
  remarks               String?
  createdAt             DateTime                  @default(now()) @map("created_at")
  updatedAt             DateTime                  @updatedAt @map("updated_at")

  assignment          ProjectMaterialAssignment @relation(...)
  product             Product                   @relation(...)
  purchaseRequestLine PurchaseRequestLine?    @relation(...)
  dispatchLines       ProjectDispatchLine[]

  @@index([assignmentId])
  @@map("project_material_lines")
}

model ProjectDispatch {
  id            String                @id @default(uuid()) @db.Uuid
  dispatchNo    String                @unique @map("dispatch_no")
  projectId     String                @map("project_id") @db.Uuid
  companyId     String                @map("company_id") @db.Uuid
  warehouseId   String                @map("warehouse_id") @db.Uuid
  status        ProjectDispatchStatus
  vehicleNo     String?               @map("vehicle_no")
  receiverName  String?               @map("receiver_name")
  receiverMobile String?              @map("receiver_mobile")
  dispatchedAt  DateTime?             @map("dispatched_at")
  signatureData String?               @map("signature_data")
  remarks       String?
  createdById   String                @map("created_by") @db.Uuid
  createdAt     DateTime              @default(now()) @map("created_at")
  updatedAt     DateTime              @updatedAt @map("updated_at")

  project   Project               @relation(...)
  warehouse Warehouse             @relation(...)
  lines     ProjectDispatchLine[]
  createdBy User                  @relation(...)

  @@index([projectId])
  @@index([companyId, status])
  @@map("project_dispatches")
}

model ProjectDispatchLine {
  id                  String  @id @default(uuid()) @db.Uuid
  dispatchId          String  @map("dispatch_id") @db.Uuid
  materialLineId      String  @map("material_line_id") @db.Uuid
  productId           String  @map("product_id") @db.Uuid
  qty                 Decimal @db.Decimal(12, 3)
  kitProductId        String? @map("kit_product_id") @db.Uuid
  kitProductName      String? @map("kit_product_name")
  kitBomQty           Decimal? @map("kit_bom_qty") @db.Decimal(12, 3)
  sortOrder           Int     @default(0) @map("sort_order")

  dispatch     ProjectDispatch      @relation(...)
  materialLine ProjectMaterialLine  @relation(...)
  product      Product              @relation(...)
  serials      ProjectDispatchLineSerial[]

  @@map("project_dispatch_lines")
}

model ProjectDispatchLineSerial {
  id              String @id @default(uuid()) @db.Uuid
  dispatchLineId  String @map("dispatch_line_id") @db.Uuid
  serialId        String @map("serial_id") @db.Uuid

  dispatchLine ProjectDispatchLine @relation(...)
  serial       InventorySerial     @relation(...)

  @@map("project_dispatch_line_serials")
}
```

### 3.3 Extensions to existing models

```prisma
// PurchaseRequestLine — add:
projectMaterialLineId String? @unique @map("project_material_line_id") @db.Uuid
projectId             String? @map("project_id") @db.Uuid

// PurchaseRequest — add optional:
sourceRemarks String? @map("source_remarks")  // e.g. "PROJECT_MATERIAL"

// ProjectProposal — add:
project Project?

// ApprovalRequestType enum — add:
PROJECT_MATERIAL
```

---

## 4. File Plan

### 4.1 New lib services

| File | Purpose |
|------|---------|
| `src/lib/project-service.ts` | CRUD, convert hook, close, status transitions |
| `src/lib/project-material-service.ts` | Assignment lines, delta detection, submit/approve |
| `src/lib/project-material-bom.ts` | Map proposal revision → product lines |
| `src/lib/project-stock-service.ts` | ISE→PCM allocation, auto transfer, PR creation |
| `src/lib/project-dispatch-service.ts` | DC create/confirm, kit/serial, PDF |
| `src/lib/project-permissions.ts` | RBAC helpers |
| `src/lib/project-dispatch-pdf.ts` | PDF with "Project Dispatch" header |

### 4.2 New API routes

```
src/app/api/projects/route.ts
src/app/api/projects/[id]/route.ts
src/app/api/projects/[id]/material-assignment/route.ts
src/app/api/projects/[id]/material-assignment/lines/route.ts
src/app/api/projects/[id]/material-assignment/lines/[lineId]/route.ts
src/app/api/projects/[id]/material-assignment/submit/route.ts
src/app/api/projects/[id]/material-assignment/approve/route.ts
src/app/api/projects/[id]/close/route.ts
src/app/api/project-dispatches/route.ts
src/app/api/project-dispatches/[id]/route.ts
src/app/api/project-dispatches/[id]/confirm/route.ts
src/app/api/project-dispatches/[id]/pdf/route.ts
src/app/api/project-dispatches/dispatchable/route.ts
```

### 4.3 New pages / components

```
src/app/(app)/projects/list/page.tsx          // or extend projects/page.tsx
src/app/(app)/projects/[id]/page.tsx
src/components/projects/project-list.tsx
src/components/projects/project-detail.tsx
src/components/projects/project-material-form.tsx
src/components/projects/project-dispatch-form.tsx
src/components/inventory/dispatch-projects-panel.tsx
// Extend dispatch page with tabs
```

### 4.4 Modify existing

| File | Change |
|------|--------|
| `project-proposal-service.ts` | `convertProjectProposalToProject` creates Project |
| `approvals-service.ts` | Handle `PROJECT_MATERIAL` |
| `purchase-request-service.ts` | Auto-create from material lines; fulfillment hook |
| `src/app/(app)/inventory/dispatches/page.tsx` | Add Retail / Projects tabs |
| `src/lib/rbac.ts` | Nav + permissions for projects execution |
| `prisma/seed.ts` | Sample converted project + assignment |

---

## 5. BOM Resolution Strategy

Proposal revisions do not store flat product lines today. Implement `project-material-bom.ts`:

1. Load current revision + package master.
2. Map BOM text lines to `Product.id` where possible (moduleProductId, inverter from package rules, structure items from category lookup).
3. Merge `moduleQty`, additional panels, inverter upgrade into qty per product.
4. Store as `ProjectMaterialLine` source=`PROPOSAL`.
5. Kits: if product `isKit`, store kit productId; explode on transfer/dispatch via `loadKitBomMap`.

Add unit tests mirroring `proposal-pdf.test.ts` / `proposal-bom` cases.

---

## 6. Delta Approval Algorithm

```
For each material line:
  needsApproval =
    line.source == ADDED && line never approved
    OR line.requiredQty != line.lastApprovedQty
    OR line.lineStatus == PENDING_APPROVAL

On submit: create ApprovalRequest with payload { projectId, lineIds[], snapshot }
On approve: set lastApprovedQty = requiredQty for approved lines; run stock allocation
Unchanged lines: lastApprovedQty matches requiredQty → skip
```

---

## 7. Stock Allocation Algorithm

```
For each line needing fulfillment (approvedQty delta or new):
  remaining = requiredQty - assignedQty
  availIse = stock(ISE, JAL-HO, product)
  takeIse = min(remaining, availIse)
  remaining -= takeIse
  availPcm = stock(PCM, JAL-HO, product)
  takePcm = min(remaining, availPcm)
  remaining -= takePcm
  if takeIse > 0: queue transfer ISE HO → JAL-PRJ
  if takePcm > 0: queue transfer PCM HO → JAL-PRJ (cross-company)
  if remaining > 0: create/update PR line; lineStatus = PENDING_STOCK
  append stockSourceLog entries
Execute transfers in single transaction; auto dispatch+receive
```

---

## 8. RBAC Additions

| Action | Roles |
|--------|-------|
| View projects | Super Admin, Admin, Projects Manager |
| Convert proposal | Projects Manager, Super Admin |
| Edit material assignment | Projects Manager, Super Admin |
| Approve project material | Projects Manager, Super Admin |
| View projects dispatch | Super Admin, Warehouse, Projects Manager, Admin |
| Create/confirm project DC | Super Admin, Warehouse, Projects Manager |
| Close project | Projects Manager, Super Admin |
| View linked PRs | Purchase Manager, Projects Manager, Super Admin |

---

## 9. Testing Strategy

| Area | Test file |
|------|-----------|
| BOM resolver | `project-material-bom.test.ts` |
| Delta detection | `project-material-service.test.ts` |
| Stock allocation | `project-stock-service.test.ts` |
| Permissions | `project-permissions.test.ts` |
| Close + auto-return | `project-service.test.ts` |

Manual QA: `docs/PROMPT_11-14_QA_CHECKLIST.md`

---

## 10. Migration Order

1. Prompt 11 migration: Project + Assignment + Lines tables; extend proposal FK
2. Prompt 12 migration: Approval type; PR line FKs; stockSourceLog
3. Prompt 13 migration: ProjectDispatch tables
4. Prompt 14: No schema change if hooks only; optional return transfer audit types
