# Sales Dashboard — Implementation Plan

**Date:** 20 August 2026  
**Status:** Architecture proposal (Command 3) — no production code changes yet  
**Inputs:** `SALES_DASHBOARD_DATA_AUDIT.md`, `docs/IVAAN_OPS_SALES_DASHBOARD_PRD.md`, `REPORT_FORMULA_RECONCILIATION` (§10)

---

## 1. Goals

Build a role-aware `/dashboard` and enhanced `/reports` hub that:

- Reuses **authoritative** formulas from `getSalesExecutiveReport()` and related report services
- Enforces **server-side** executive scoping (pattern: service dashboard + `restrictSalesUserId`)
- Uses **Asia/Kolkata** business dates (new utility — replaces ad hoc UTC/local mix)
- Avoids duplicate aggregation in React components
- Extends existing design system (`Card`, `Button`, `Badge`, `Table`, `Tabs`)
- Adds Module Mastery / targets via new schema only where operational data is insufficient

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│  /dashboard (Server Component shell)                            │
│    ├── role → ExecutiveDashboard | ManagerDashboard             │
│    └── parallel fetch via getSalesDashboard()                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  src/lib/sales-dashboard/                                       │
│    dashboard-api.ts        — auth + scope resolution              │
│    dashboard-permissions.ts — RBAC helpers                      │
│    dashboard-types.ts      — typed DTOs                         │
│    dashboard-service.ts    — orchestration (executive/manager)  │
│    kpi-service.ts          — KPI strip + period comparison      │
│    dispatch-today-service.ts — today's hero metrics             │
│    work-queue-service.ts   — follow-ups, expiring, unpaid, quiet│
│    stock-watch-service.ts  — sales-relevant stock               │
│    funnel-service.ts       — funnel + trend aggregations        │
│    team-service.ts         — scoreboard, comparison             │
│    module-mastery-service.ts — levels, journey, leaderboard     │
│    target-service.ts       — monthly module targets             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  src/lib/report-service.ts (refactored)                           │
│    Shared query builders: quotations, PIs, payments, dispatches │
│    getDispatchedUnitTotals() — module / inverter / other        │
│    getSalesExecutiveReport() — thin wrapper over builders       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Prisma / operational tables (source of truth)                  │
│  + optional projection tables (Module Mastery cache only)       │
└─────────────────────────────────────────────────────────────────┘
```

**Pattern to follow:** Service module (`src/lib/service-api.ts` + `getServiceDashboardMetrics`) — resolve access once, pass `restrictToUserId` into analytics.

---

## 3. Routes & Pages

### 3.1 Modify

| Route | Change |
|---|---|
| `src/app/(app)/dashboard/page.tsx` | Replace placeholder cards with role-aware dashboard shell; load analytics server-side |
| `src/app/(app)/reports/page.tsx` | Pass additional report types when hub expands (Commands 12) |
| `src/components/reports/reports-hub.tsx` | Add Sales Performance, Funnel, Collection, Executive Performance tabs |

### 3.2 Add

| Route | Purpose | Roles |
|---|---|---|
| `src/app/(app)/dashboard/module-mastery/page.tsx` | My Journey detail | Sales Executive (+ manager drill-down with auth) |
| `src/app/(app)/dashboard/executive/[id]/page.tsx` | Manager drill-down to executive performance | Sales Manager, Super Admin |
| `src/app/(app)/admin/module-mastery/page.tsx` | Module Mastery config (levels, slab size) | Super Admin (optional Sales Manager read) |
| `src/app/(app)/admin/sales-targets/page.tsx` | Company + executive module targets | Super Admin, Sales Manager |

### 3.3 Drill-down targets (reuse — no new list pages)

| Widget click | Existing route + query params |
|---|---|
| Quotation KPI | `/sales/quotations?from=&to=&salesUserId=` |
| PI KPI | `/sales/proforma-invoices?status=&salesUserId=` |
| Collection / outstanding bucket | `/reports` → payment-followup tab + `ageingBucket` |
| Dispatched value | `/reports` → dispatch tab + date/executive filters |
| Today's dispatches | `/inventory/dispatches/challans?from=today&salesUserId=` *(extend list filters)* |
| Expiring quotations | `/sales/quotations?status=SENT&expiry=soon` *(add filter support)* |
| Unpaid PIs | `/sales/proforma-invoices` + outstanding filter *(add)* |
| Approvals summary | `/approvals` |
| Stock short | `/sales/inventory-timeline?productId=` |
| Executive row | `/dashboard/executive/[id]` |

**Note:** Several list pages lack executive/date query filters today — Command 13 adds params to existing pages, not duplicates.

---

## 4. API Endpoints

Prefer **Server Components** for initial dashboard load (faster, no client waterfall). Add API routes only where client interaction requires refresh.

### 4.1 Primary (recommended)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Unified payload; role selects executive vs manager shape |
| GET | `/api/dashboard/executive` | Executive-only DTO (optional split) |
| GET | `/api/dashboard/manager` | Manager-only DTO (optional split) |

Implementation mirrors `GET /api/service/dashboard`.

**Query params (all routes):** `fromDate`, `toDate`, `period` (`today|week|month|quarter|custom`), `salesUserId` (manager/admin only — validated server-side).

### 4.2 Secondary (lazy / client charts)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/dashboard/funnel` | Funnel + conversion (period-scoped) |
| GET | `/api/dashboard/trend` | Performance trend (`metric=modules|dispatch|collection|pi`) |
| GET | `/api/dashboard/work-queue` | Paginated actionable lists |
| GET | `/api/dashboard/stock-watch` | Sales stock watch rows |
| GET | `/api/dashboard/team-scoreboard` | Manager scoreboard |
| GET | `/api/dashboard/module-mastery` | Current month progress |
| GET | `/api/dashboard/module-mastery/journey` | Achievement history |
| GET | `/api/dashboard/module-mastery/leaderboard` | Team leaderboard |
| GET | `/api/dashboard/approvals-summary` | Counts by approval type |

### 4.3 Configuration (Commands 8–9)

| Method | Endpoint | Purpose |
|---|---|---|
| GET/PUT | `/api/settings/module-mastery` | Level config, slab size, god levels |
| GET/PUT | `/api/settings/sales-targets` | Company default + executive overrides |
| POST | `/api/dashboard/module-mastery/recalculate` | Authorized recalculation trigger |

### 4.4 Reports hub (extend existing)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/reports/sales-performance` | Detailed performance table + export |
| GET | `/api/reports/sales-funnel` | Stage breakdown report |
| GET | `/api/reports/collection` | Collection + ageing report |
| GET | `/api/reports/executive-performance` | Targets + mastery + KPI composite |

Reuse `parseReportRequest`, `respondWithReport`, `restrictSalesUserId` from `src/lib/report-api.ts`.

---

## 5. Services — New & Modified

### 5.1 New module: `src/lib/sales-dashboard/`

| File | Responsibility |
|---|---|
| `dashboard-api.ts` | `resolveSalesDashboardAccess(session)` → `{ companyId, restrictToUserId, role, canViewTeam }` |
| `dashboard-permissions.ts` | `canViewSalesDashboard`, `canViewTeamDashboard`, `canViewExecutiveDetail`, `canConfigureMastery` |
| `dashboard-types.ts` | DTOs: `ExecutiveDashboardDto`, `ManagerDashboardDto`, `KpiStrip`, `DispatchTodayHero`, etc. |
| `dashboard-service.ts` | Top-level `getSalesDashboard()` — parallel `Promise.all` of widget services |
| `kpi-service.ts` | KPI strip + previous-period delta via shared report builders |
| `dispatch-today-service.ts` | Planned/completed/pending/blocked + unit breakdown (uses `inventory-timeline` logic + approvals) |
| `work-queue-service.ts` | Expiring quotes, unpaid PIs, quiet customers, stuck PIs |
| `stock-watch-service.ts` | Wraps `getBookedAvailableReport` / reserved qty for executive-relevant products |
| `funnel-service.ts` | Four-stage funnel from KPI builders |
| `trend-service.ts` | Daily/monthly buckets for selected metric |
| `team-service.ts` | Scoreboard, executive comparison, team funnel |
| `risk-service.ts` | Pipeline risks + exceptions lists for manager view |

### 5.2 New: cross-cutting utilities

| File | Responsibility |
|---|---|
| `src/lib/business-dates.ts` | **Asia/Kolkata** `today()`, `monthRange()`, `parseBusinessDate()`, `endOfBusinessDay()` |
| `src/lib/report-builders.ts` | Extracted Prisma where clauses + aggregations from `report-service.ts` |
| `src/lib/module-mastery-service.ts` | Level engine, achievements, recalculation |
| `src/lib/sales-target-service.ts` | Target resolution: monthly override → executive override → company default |

### 5.3 Modify (refactor, not duplicate)

| File | Change |
|---|---|
| `src/lib/report-service.ts` | Extract builders; add `getDispatchedUnitTotals()`; keep `getSalesExecutiveReport` as wrapper |
| `src/lib/reports.ts` | Delegate date parsing to `business-dates.ts` (backward-compatible wrappers) |
| `src/lib/report-permissions.ts` | Add dashboard-specific permission helpers; reuse `restrictSalesUserId` |
| `src/lib/quotation-service.ts` | Export helpers for expiring quotation queries (used by work queue) |
| `src/lib/pi-service.ts` | Export unpaid PI query helper |
| `src/lib/approvals-service.ts` | Add `getApprovalSummaryByType()` for manager strip |
| `src/lib/inventory-timeline.ts` | Export dispatch-today PI classification for reuse in `dispatch-today-service` |

---

## 6. Components — New

```text
src/components/dashboard/
  dashboard-shell.tsx           — greeting, period selector, role switch
  executive/
    dispatch-today-hero.tsx
    kpi-strip.tsx
    quick-actions.tsx
    work-queue-panel.tsx
    outstanding-aging-widget.tsx
    sales-stock-watch.tsx
    module-mastery-card.tsx
    module-target-card.tsx
  manager/
    approval-summary-strip.tsx
    team-kpi-strip.tsx
    team-scoreboard.tsx
    pipeline-risks-panel.tsx
    dispatch-operations-panel.tsx
    stock-conflicts-panel.tsx
    team-module-mastery.tsx
  charts/
    sales-funnel-chart.tsx
    performance-trend-chart.tsx
    aging-histogram.tsx
    executive-comparison-chart.tsx
    product-composition-chart.tsx
  module-mastery/
    level-badge.tsx
    slab-progress.tsx
    next-level-preview.tsx
    level-up-celebration.tsx
    mastery-journey.tsx
    mastery-timeline.tsx
    mastery-leaderboard.tsx
  shared/
    period-selector.tsx
    metric-selector.tsx
    empty-state.tsx
    kpi-card.tsx                  — clickable, links to drill-down
```

### Reuse existing

| Component | Use |
|---|---|
| `src/components/ui/card.tsx` | All widgets |
| `src/components/ui/button.tsx` | Quick actions, drill-down |
| `src/components/ui/badge.tsx` | Level badges, status chips |
| `src/components/ui/table.tsx` | Scoreboard, work queues |
| `src/components/ui/tabs.tsx` | Period toggle, report tabs |
| `src/components/reports/reports-hub.tsx` | Reports hub extension |
| `src/components/approvals/pending-approvals-list.tsx` | Linked from approval summary |
| `src/components/inventory/inventory-timeline.tsx` | Stock conflict drill-down |
| `src/lib/report-export.ts`, `report-pdf.ts` | Report exports |

---

## 7. Database Changes

**Deferred to Command 4** (`SALES_DASHBOARD_DATABASE_CHANGE_PLAN.md`). High-level expectation:

| Need | Approach |
|---|---|
| Module Mastery config + levels | New tables (`ModuleMasteryConfig`, `ModuleMasteryLevel`) |
| Monthly progress cache | `ExecutiveModuleMasteryProgress` (projection only) |
| Achievements + celebration ack | `ExecutiveModuleLevelAchievement` |
| Module targets | `SalesModuleTarget` (company default, executive override, monthly override) |
| Risk thresholds | `SalesDashboardConfig` or JSON on company — quiet customer days, stuck PI days |
| KPI / dispatch data | **No new tables** — operational source of truth |

Operational dispatch records remain authoritative for module counts; progress tables are cache/projections only.

---

## 8. Indexes

Existing indexes likely sufficient for dashboard queries. **Verify in Command 4** after query plans:

| Table | Existing | May add |
|---|---|---|
| `dispatches` | `(company_id, status)`, `(proforma_invoice_id)` | Composite `(company_id, status, dispatch_date)` if slow |
| `proforma_invoices` | `(company_id, status)`, `(company_id, dispatch_today_date)` | `(company_id, sales_user_id, pi_date)` |
| `quotations` | `(company_id, status)` | `(company_id, sales_user_id, quotation_date)`, `(company_id, expiry_date, status)` |
| `payments` | `(company_id, payment_date)` | `(proforma_invoice_id)` already exists |
| `dispatch_lines` | `(dispatch_id)` | Join via dispatch — no new index unless N+1 |

Run `EXPLAIN ANALYZE` on team scoreboard (N executives × 5 metrics) during Command 15 validation.

---

## 9. Caching Strategy

| Layer | Strategy |
|---|---|
| **Dashboard initial load** | No cache — fresh operational snapshot; parallel queries |
| **Module Mastery progress** | Monthly projection row per `(executive_id, year, month)`; updated on dispatch complete/cancel and via recalculate endpoint |
| **Achievement records** | Written once when threshold crossed; idempotent on recalculate |
| **Chart trend data** | Compute on demand; optional 5-minute in-memory cache per `(companyId, executiveId, period, metric)` if perf requires — **not in v1** unless profiling shows need |
| **Config (levels, targets)** | Read on each request; small table, infrequent changes |

**Invalidation triggers:**

- Dispatch completed → recalculate executive month modules + achievements for PI's `salesUserId`
- Dispatch cancelled → same recalculation
- PI `salesUserId` change (edit) → recalculate old and new executive for affected months

No Redis required for v1 — PostgreSQL projection tables + efficient SQL aggregation.

---

## 10. Authorization Strategy

Extend existing RBAC — **no parallel permission system**.

| Capability | Roles | Enforcement |
|---|---|---|
| Own executive dashboard | Sales Executive, Sales Manager, Super Admin | `restrictToUserId = session.user.id` for executive widgets |
| Team / manager dashboard | Sales Manager, Super Admin | `canViewTeamDashboard()` |
| View other executive detail | Sales Manager, Super Admin | Validate `salesUserId` param; reject if executive tries |
| Team leaderboard (executive visible) | Configurable | `ModuleMasteryConfig.leaderboardVisibleToExecutives` |
| Module Mastery config | Super Admin | `canConfigureModuleMastery()` |
| Sales targets edit | Super Admin, Sales Manager | Match existing admin patterns |
| Recalculate mastery | Super Admin (+ manager TBD) | Protected POST endpoint |
| Reports / exports | Existing `report-permissions.ts` | Unchanged |

**Implementation:**

```typescript
// dashboard-api.ts (conceptual)
export function resolveSalesDashboardAccess(session: Session) {
  const companyId = requireActiveCompany(session);
  const roles = session.user.roles;
  const isExecutive = roles.includes(ROLES.SALES_EXECUTIVE);
  const isManager = isSuperAdmin(roles) || roles.includes(ROLES.SALES_MANAGER);

  return {
    companyId,
    restrictToUserId: isExecutive && !isManager ? session.user.id : null,
    canViewTeam: isManager,
    requestedExecutiveId: /* validated below */,
  };
}

export function resolveExecutiveId(
  access: SalesDashboardAccess,
  requestedId?: string,
): string {
  if (access.restrictToUserId) return access.restrictToUserId;
  if (requestedId && access.canViewTeam) return requestedId;
  throw forbidden();
}
```

Every API handler and server component calls this before analytics.

---

## 11. Analytics Aggregation Strategy

### 11.1 Principles

1. **Single source:** All KPI values flow through `report-builders.ts`
2. **Parallel independent queries:** `Promise.all` for KPI strip, dispatch today, work queue, stock watch
3. **No N+1 per executive on manager dashboard:** Use grouped SQL / batch queries:

```text
Team scoreboard (preferred):
  1 query — group dispatches by sales_user_id for unit totals
  1 query — group quotations by sales_user_id
  1 query — group PIs by sales_user_id
  1 query — group payments by sales_user_id via join
  Merge in memory by executive id
```

4. **Today's widgets always use business today** — independent of dashboard period selector (PRD §30)

### 11.2 Shared builder functions (extract from report-service)

| Builder | Returns |
|---|---|
| `buildQuotationValueAggregate(filters)` | number |
| `buildPiValueAggregate(filters)` | number |
| `buildCollectionValueAggregate(filters)` | number |
| `buildDispatchedValueAggregate(filters)` | number |
| `buildDispatchedUnitTotals(filters)` | `{ modules, inverters, other }` |
| `buildNewCustomersCount(filters)` | number |
| `buildDispatchWhere(filters)` | Prisma where clause (shared) |

Filters type: `{ companyId, salesUserId?, fromDate?, toDate?, customerType? }`

### 11.3 Work queue aggregation

| Queue | Query basis |
|---|---|
| Expiring quotations | `quotation-service` + `refreshExpiredQuotations`; filter `SENT` by `expiryDate` windows |
| Unpaid PIs | Same PI set as `getPaymentFollowupReport` with `outstanding > 0` |
| Quiet customers | New query: customers with `assignedSalesUserId = executive` and `MAX(activity dates) < today - threshold` |
| Stuck PIs | PIs in `ISSUED`/`PENDING_BOOKING`/`BOOKED` with `daysInStatus > threshold` |

### 11.4 Stock watch

1. Collect product IDs from executive's open quotations + open/booked PIs
2. For each product, call existing `getWarehouseStockForProduct` + sum open requirement from PI/quote items
3. Reuse `calculateFreeQty` from `reports.ts`
4. Limit to top N shorts (e.g. 10) by severity

---

## 12. Chart Component Strategy

**Library:** Install **Recharts** (`recharts`) — React 19 compatible, composable, fits server+client split (charts as client components with serialized props).

| Chart | Component | Data source |
|---|---|---|
| Sales funnel | `SalesFunnelChart` | `funnel-service.ts` |
| Performance trend | `PerformanceTrendChart` | `trend-service.ts` |
| Outstanding aging | `AgingHistogram` | Payment follow-up buckets *(match report buckets unless product chooses PRD buckets)* |
| Executive comparison | `ExecutiveComparisonChart` | `team-service.ts` |
| Product composition | `ProductCompositionChart` | Unit totals from `buildDispatchedUnitTotals` |
| Module Mastery history | `MasteryMonthlyChart` | `module-mastery-service.ts` |

**Rules:**

- Charts receive pre-aggregated DTOs — no client-side business logic
- Client components only for interactivity (metric selector, hover, click → router.push drill-down)
- Lazy-load below-fold charts via dynamic `import()` with skeleton states

---

## 13. Module Mastery Calculation Strategy

### 13.1 Source of truth

```text
monthlyModules = SUM(dispatch_line.qty)
  WHERE dispatch.status = DISPATCHED
    AND product.category.name = 'Modules'
    AND dispatch_date in [monthStart, monthEnd]  -- Asia/Kolkata
    AND proforma_invoice.sales_user_id = executiveId
```

Same scope as §10.7 in audit — **not** quotation/PI/booked/planned qty.

### 13.2 Level engine (pure function)

`calculateModuleMasteryLevel(totalModules, config)` in `module-mastery-service.ts`:

- Slab size default 500
- Levels 1–15 from `ModuleMasteryLevel` table (name, badge, threshold = level × slabSize)
- Beyond level 15: dynamic God levels every `godLevelIncrement` (default 500)
- Returns: `{ currentLevel, currentLevelName, progressInSlab, nextLevel, modulesToNext }`

**Examples validated in unit tests** (Command 9): 0, 237, 500, 999, 1000, 1237, 1500, 7500, 8237, multi-level crossing, reversal, month boundary.

### 13.3 Achievement recording

On module total increase, detect crossed thresholds → insert `ExecutiveModuleLevelAchievement` (unique per executive/month/level).

Celebration: `celebration_shown_at` null → show once on dashboard load → client ack updates `celebration_acknowledged_at`.

### 13.4 Projection cache

`ExecutiveModuleMasteryProgress` updated whenever:

- Dispatch completes or cancels
- Recalculate endpoint invoked
- Month rolls over (first dashboard hit of new month creates new row)

Cache stores computed fields for fast dashboard card; **always auditable** back to dispatch lines.

---

## 14. Target Configuration Strategy

Separate from Module Mastery (PRD §14).

**Resolution order:**

```text
1. SalesModuleTargetMonthlyOverride (executive + year + month)
2. SalesModuleTargetExecutiveOverride (executive, no month)
3. SalesModuleTargetCompanyDefault (company)
4. Hard default: 3000 modules
```

**Widget:** `achieved / target` using same `monthlyModules` as mastery source.

**UI:** `ModuleTargetCard` adjacent to `ModuleMasteryCard` on executive dashboard.

**Admin:** `/admin/sales-targets` — reuse admin page patterns from `src/app/(app)/admin/users/page.tsx`.

---

## 15. Recalculation Strategy (Dispatch Corrections)

```text
Operational dispatch change
        ↓
Hook in dispatch-service (complete + cancel approve)
        ↓
moduleMasteryService.recalculateExecutiveMonth(executiveId, dispatchDate)
        ↓
Re-sum modules from dispatches → update progress cache → sync achievements
        ↓
Dashboard reads cache + live today partial if needed
```

**Authorized manual recalculate** (`POST /api/dashboard/module-mastery/recalculate`):

| Scope | Body |
|---|---|
| One executive, one month | `{ executiveId, year, month }` |
| All executives, current month | `{ all: true }` |

**Never** store module counts independently of dispatch reconciliation.

---

## 16. Business Dates (Asia/Kolkata)

New `src/lib/business-dates.ts` — **prerequisite for Commands 5+**

| Function | Purpose |
|---|---|
| `getBusinessToday()` | YYYY-MM-DD in Asia/Kolkata |
| `getBusinessMonthRange(year?, month?)` | Start/end for mastery, targets, KPI default period |
| `parseBusinessDate(string)` | Replace UTC `parseReportDate` for dashboard |
| `endOfBusinessDay(string)` | End of business day in IST |
| `getPreviousPeriodRange(from, to)` | KPI comparison strip |

Migrate `report-service.ts` to accept optional timezone-aware dates; keep backward-compatible wrappers for existing reports until explicitly migrated.

---

## 17. Phased File-by-File Change List

### Phase A — Foundation (Command 5)

| Action | Files |
|---|---|
| Add | `src/lib/business-dates.ts`, `src/lib/business-dates.test.ts` |
| Add | `src/lib/report-builders.ts`, `src/lib/report-builders.test.ts` |
| Refactor | `src/lib/report-service.ts` — extract builders, add `getDispatchedUnitTotals` |
| Add | `src/lib/sales-dashboard/dashboard-api.ts` |
| Add | `src/lib/sales-dashboard/dashboard-permissions.ts` |
| Add | `src/lib/sales-dashboard/dashboard-types.ts` |
| Add | `src/lib/sales-dashboard/kpi-service.ts` |
| Add | `src/lib/sales-dashboard/dispatch-today-service.ts` |
| Add | `src/lib/sales-dashboard/work-queue-service.ts` |
| Add | `src/lib/sales-dashboard/stock-watch-service.ts` |
| Add | `src/lib/sales-dashboard/funnel-service.ts` |
| Add | `src/lib/sales-dashboard/trend-service.ts` |
| Add | `src/lib/sales-dashboard/team-service.ts` |
| Add | `src/lib/sales-dashboard/dashboard-service.ts` |
| Add | `src/lib/sales-dashboard/*.test.ts` |
| Add | `src/app/api/dashboard/route.ts` |

### Phase B — Executive Dashboard UI (Command 6)

| Action | Files |
|---|---|
| Rewrite | `src/app/(app)/dashboard/page.tsx` |
| Add | `src/components/dashboard/**` (executive widgets, shell, shared) |
| Modify | `package.json` — no chart lib yet |

### Phase C — Charts (Command 7)

| Action | Files |
|---|---|
| Add dep | `recharts` |
| Add | `src/components/dashboard/charts/**` |
| Modify | Executive dashboard page — chart section |

### Phase D — Targets (Command 8)

| Action | Files |
|---|---|
| Migrate | Prisma schema + migration (per Command 4 plan) |
| Add | `src/lib/sales-target-service.ts` |
| Add | Admin targets page + API |
| Add | `ModuleTargetCard` component |

### Phase E — Module Mastery Engine (Command 9)

| Action | Files |
|---|---|
| Migrate | Mastery schema |
| Add | `src/lib/module-mastery-service.ts`, tests |
| Hook | `src/lib/dispatch-service.ts` — recalculate on complete/cancel |
| Add | Recalculate API |

### Phase F — Module Mastery UI (Command 10)

| Action | Files |
|---|---|
| Add | Mastery card, journey page, celebration |
| Add | `src/app/(app)/dashboard/module-mastery/page.tsx` |

### Phase G — Manager Dashboard (Command 11)

| Action | Files |
|---|---|
| Add | Manager widget components |
| Extend | `dashboard-service.ts` — manager branch |
| Add | `src/app/(app)/dashboard/executive/[id]/page.tsx` |

### Phase H — Reports Hub (Command 12)

| Action | Files |
|---|---|
| Add | New report API routes |
| Extend | `reports-hub.tsx`, `report-service.ts` |

### Phase I — Drill-down & list filters (Command 13)

| Action | Files |
|---|---|
| Modify | Quotations/PI/dispatch list pages + APIs — query param filters |
| Modify | Dashboard components — href builders |

### Phase J — Security & validation (Commands 14–15)

| Action | Files |
|---|---|
| Add | `SALES_DASHBOARD_SECURITY_AUDIT.md` |
| Add | `SALES_DASHBOARD_IMPLEMENTATION_REPORT.md` |
| Add | Authorization integration tests |

---

## 18. Existing Assets to Reuse (Explicit)

| Asset | Reuse for |
|---|---|
| `getSalesExecutiveReport()` | KPI strip, funnel, team scoreboard values |
| `getPaymentFollowupReport()` | Outstanding aging, unpaid PI lists |
| `getDispatchReport()` | Dispatch drill-down detail (not KPI sum) |
| `getBookedAvailableReport()` / `getReservedQtyReport()` | Stock watch |
| `listPendingApprovals()` / `countPendingApprovalsForUser()` | Manager approval strip |
| `restrictSalesUserId()` | All dashboard/report API scoping |
| `parseReportRequest()` / `respondWithReport()` | New report endpoints |
| `refreshExpiredQuotations()` | Expiring quotation queue |
| `inventory-timeline.ts` dispatch-today logic | Today's dispatch hero |
| `isDispatchTodayActive()` | Today classification |
| `calculateOutstanding()` | Unpaid PI detection |
| `getWarehouseStockForProduct()` | Stock availability |
| `explodeItemsForFulfillment()` / kit BOM | Stock requirement from kit lines |
| `formatCurrency()` | KPI display |
| `Card`, `Button`, `Badge`, `Table`, `Tabs` | All UI |
| Service dashboard pattern | API + access resolution architecture |

---

## 19. Out of Scope / Deferred

| Item | Reason |
|---|---|
| Sales customer follow-up model | No schema — quiet customers use activity heuristic only in v1 |
| Replacing PI Value status filter | Requires report change + business sign-off (reconciliation R2) |
| PRD aging buckets without report alignment | Product decision (reconciliation R4) |
| Redis / external cache | Add only if profiling requires |
| Mobile-first redesign | PRD specifies desktop-first |
| Project sales (proposals/enquiries) | Separate module — not in retail sales dashboard v1 |

---

## 20. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Formula drift | Mandatory use of `report-builders.ts`; tests compare dashboard vs report |
| Executive data leak | Central `resolveSalesDashboardAccess`; integration tests per Command 14 |
| IST boundary bugs | Dedicated `business-dates.test.ts` with month-boundary cases |
| Manager query perf | Batch aggregates; add indexes in Command 4 if needed |
| Kit module counting | Unit tests with kit dispatch fixtures |
| Rounding KPI vs drill-down | Document; KPI uses executive aggregation policy |

---

## 21. Next Step

**Command 4:** Create `SALES_DASHBOARD_DATABASE_CHANGE_PLAN.md` with minimum schema changes, indexes, and migration notes for Module Mastery, targets, and config — avoiding changes where operational schema suffices.
