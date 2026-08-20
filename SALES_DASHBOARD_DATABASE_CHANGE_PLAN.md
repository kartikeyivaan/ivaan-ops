# Sales Dashboard — Database Change Plan

**Date:** 20 August 2026  
**Status:** Command 4 — review only, **do not run migrations yet**  
**Inputs:** `SALES_DASHBOARD_IMPLEMENTATION_PLAN.md`, `SALES_DASHBOARD_DATA_AUDIT.md`, PRD §36

---

## 1. Summary

| Category | New tables | Modified tables | New indexes (existing tables) |
|---|---:|---:|---:|
| Module Mastery | 4 | 0 | 0 |
| Module Targets | 1 | 0 | 0 |
| Dashboard config | 1 | 0 | 0 |
| Analytics performance | 0 | 0 | 4 |
| **Total** | **6** | **0** | **4** |

**Principle:** All KPI, funnel, dispatch, collection, and quotation metrics read from **existing operational tables**. New schema is limited to gamification configuration, target configuration, progress **projections**, and achievement audit — never a second source of truth for dispatched modules.

---

## 2. Schema Changes NOT Required

The following PRD features are fully supported by existing schema and services:

| Feature | Existing source | Why no migration |
|---|---|---|
| Quotation / PI / Collection / Dispatched value | `quotations`, `proforma_invoices`, `payments`, `dispatches`, `dispatch_lines` | Formulas in `report-service.ts` |
| Module / inverter / other unit counts | `dispatch_lines` → `products` → `product_categories` | Aggregate at query time; optional index only |
| Outstanding aging | `proforma_invoices` + `payments` | `getPaymentFollowupReport()` |
| Expiring quotations | `quotations.expiry_date`, `status` | Query + optional index |
| Unpaid PIs | Same as payment follow-up | No new columns |
| Approvals summary | `approval_requests` + status tables | `approvals-service.ts` |
| Today's dispatches | `proforma_invoices.dispatch_today_date`, `dispatches` | Existing columns |
| Sales stock watch | Inventory + PI/quote items | Existing joins |
| Quiet customers | Activity dates across existing tables | Computed; thresholds in config table only |
| Sales follow-ups | — | Deferred (no retail follow-up model) |

---

## 3. New Enums

### 3.1 `ModuleMasteryResetPeriod`

| Value | Meaning |
|---|---|
| `MONTHLY` | Progress resets each calendar month (default) |

*Extensible later (`QUARTERLY`, etc.) without breaking v1.*

### 3.2 `SalesModuleTargetScope`

| Value | Meaning |
|---|---|
| `COMPANY_DEFAULT` | Company-wide default target |
| `EXECUTIVE_DEFAULT` | Standing override for one executive |
| `MONTHLY_OVERRIDE` | Executive + specific year/month |

---

## 4. New Tables

### 4.1 `module_mastery_config`

**Prisma model:** `ModuleMasteryConfig`  
**Purpose:** Per-company Module Mastery settings (one row per company).

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id` |
| `metric_type` | `String` | No | `"DISPATCHED_MODULES"` | Extensible; v1 only this value |
| `slab_size` | `Int` | No | `500` | Modules per level slab |
| `named_level_count` | `Int` | No | `15` | Named levels before God Levels |
| `god_level_increment` | `Int` | No | `500` | Modules per God Level slab |
| `god_levels_enabled` | `Boolean` | No | `true` | |
| `reset_period` | `ModuleMasteryResetPeriod` | No | `MONTHLY` | |
| `leaderboard_visible_to_executives` | `Boolean` | No | `false` | PRD configurable visibility |
| `created_at` | `Timestamptz` | No | `now()` | |
| `updated_at` | `Timestamptz` | No | `@updatedAt` | |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `module_mastery_config_company_id_key` | `company_id` | **Unique** |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |

**Reason:** Configurable slab size, level count, God Level rules, and leaderboard visibility per PRD §35 without hardcoding in UI.

**Rollback:** `DROP TABLE module_mastery_config;`

**Seed:** Create default row for each active company on migration (or lazy-create on first read).

---

### 4.2 `module_mastery_levels`

**Prisma model:** `ModuleMasteryLevel`  
**Purpose:** Named levels 1–15 (badge, name, threshold). God Levels are **not** stored — computed dynamically.

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id` |
| `level_number` | `Int` | No | — | 1–15 (or up to `named_level_count`) |
| `name` | `String` | No | — | e.g. `"Rookie"`, `"Spark"` |
| `badge` | `String` | No | — | Emoji/icon token, e.g. `"🌱"` |
| `threshold_modules` | `Int` | No | — | Cumulative modules to **complete** this level (= `level_number × slab_size` at default) |
| `is_active` | `Boolean` | No | `true` | Soft-disable without delete |
| `sort_order` | `Int` | No | `level_number` | Display order |
| `created_at` | `Timestamptz` | No | `now()` | |
| `updated_at` | `Timestamptz` | No | `@updatedAt` | |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `module_mastery_levels_company_id_level_number_key` | `(company_id, level_number)` | **Unique** |
| `module_mastery_levels_company_id_idx` | `company_id` | Index |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |

**Reason:** PRD requires 15 configurable named levels; must not be hardcoded in React components.

**Rollback:** `DROP TABLE module_mastery_levels;`

**Seed:** Insert PRD default 15 levels per company (Rookie @ 500 … Ultimate Legend @ 7500) using company's current `slab_size` from config.

**Note:** `is_god_level` column intentionally **omitted** — God Levels are never stored as rows.

---

### 4.3 `executive_module_mastery_progress`

**Prisma model:** `ExecutiveModuleMasteryProgress`  
**Purpose:** **Cached projection** of monthly module performance for fast dashboard reads. Recomputable from `dispatches` at any time.

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id` |
| `executive_id` | `UUID` | No | — | FK → `users.id` |
| `year` | `Int` | No | — | Business calendar year (Asia/Kolkata) |
| `month` | `Int` | No | — | 1–12 |
| `modules_dispatched` | `Decimal(12,3)` | No | `0` | Sum from operational dispatches |
| `current_level_number` | `Int` | No | `1` | Active level (1–15 or God level index) |
| `current_level_name` | `String` | No | — | Denormalized for display |
| `current_slab_progress` | `Int` | No | `0` | Modules into current slab (0..slab_size−1) |
| `next_level_threshold` | `Int` | No | — | Cumulative modules for next milestone |
| `highest_completed_level` | `Int` | No | `0` | Highest level fully completed this month |
| `is_god_level` | `Boolean` | No | `false` | True when past named level 15 |
| `god_level_rank` | `Int` | No | `0` | 0 before God; 1 = God I, etc. |
| `last_calculated_at` | `Timestamptz` | No | `now()` | Audit / staleness |
| `created_at` | `Timestamptz` | No | `now()` | |
| `updated_at` | `Timestamptz` | No | `@updatedAt` | |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `executive_module_mastery_progress_exec_period_key` | `(company_id, executive_id, year, month)` | **Unique** |
| `executive_module_mastery_progress_company_period_idx` | `(company_id, year, month)` | Index — leaderboard |
| `executive_module_mastery_progress_executive_id_idx` | `executive_id` | Index |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |
| `executive_id` | `users(id)` | `RESTRICT` |

**Reason:** Avoid recomputing full dispatch aggregation on every dashboard page load; supports historical monthly chart on Journey page.

**Source of truth remains:** `dispatches` + `dispatch_lines` + module category filter. This table is **invalidate-and-rebuild** on dispatch complete/cancel or manual recalculate.

**Rollback:** `DROP TABLE executive_module_mastery_progress;` — no operational data lost.

---

### 4.4 `executive_module_level_achievements`

**Prisma model:** `ExecutiveModuleLevelAchievement`  
**Purpose:** Immutable record of each level milestone crossed; powers celebration, timeline, and audit.

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id` |
| `executive_id` | `UUID` | No | — | FK → `users.id` |
| `year` | `Int` | No | — | Month when achieved (business TZ) |
| `month` | `Int` | No | — | 1–12 |
| `level_number` | `Int` | No | — | 1–15 or synthetic God level number |
| `level_name` | `String` | No | — | Snapshot at achievement time |
| `is_god_level` | `Boolean` | No | `false` | |
| `god_level_rank` | `Int` | No | `0` | |
| `threshold_modules` | `Int` | No | — | Cumulative modules at milestone |
| `achieved_at` | `Timestamptz` | No | — | When dispatch pushed total over threshold |
| `celebration_shown_at` | `Timestamptz` | Yes | `null` | First dashboard display |
| `celebration_acknowledged_at` | `Timestamptz` | Yes | `null` | User dismissed celebration |
| `created_at` | `Timestamptz` | No | `now()` | |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `executive_module_level_achievements_unique` | `(company_id, executive_id, year, month, level_number, is_god_level, god_level_rank)` | **Unique** |
| `executive_module_level_achievements_executive_idx` | `(executive_id, year, month)` | Index |
| `executive_module_level_achievements_pending_celebration_idx` | `(executive_id)` WHERE `celebration_acknowledged_at IS NULL` | Partial index (optional) |

**Simpler unique alternative:** `(company_id, executive_id, year, month, level_number)` if God levels use level_number > 15 uniquely.

**Recommended unique:** `(company_id, executive_id, year, month, level_number, god_level_rank)`

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |
| `executive_id` | `users(id)` | `RESTRICT` |

**Reason:** PRD level-up events, one-time celebration, multiple levels in one dispatch, historical journey.

**Recalculation:** On reversal, delete achievements whose `threshold_modules` > recalculated total for that month; re-insert if thresholds crossed again.

**Rollback:** `DROP TABLE executive_module_level_achievements;`

---

### 4.5 `sales_module_targets`

**Prisma model:** `SalesModuleTarget`  
**Purpose:** Module target hierarchy — company default, executive override, monthly override (PRD §14).

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id` |
| `scope` | `SalesModuleTargetScope` | No | — | See enum §3.2 |
| `executive_id` | `UUID` | Yes | `null` | Required for `EXECUTIVE_*` scopes |
| `year` | `Int` | Yes | `null` | Required for `MONTHLY_OVERRIDE` |
| `month` | `Int` | Yes | `null` | 1–12; required for `MONTHLY_OVERRIDE` |
| `target_modules` | `Int` | No | `3000` | PRD default |
| `created_by_id` | `UUID` | No | — | FK → `users.id` |
| `updated_by_id` | `UUID` | No | — | FK → `users.id` |
| `created_at` | `Timestamptz` | No | `now()` | |
| `updated_at` | `Timestamptz` | No | `@updatedAt` | |

**Constraints (application + DB check):**

| `scope` | `executive_id` | `year` | `month` |
|---|---|---|---|
| `COMPANY_DEFAULT` | `NULL` | `NULL` | `NULL` |
| `EXECUTIVE_DEFAULT` | NOT NULL | `NULL` | `NULL` |
| `MONTHLY_OVERRIDE` | NOT NULL | NOT NULL | NOT NULL |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `sales_module_targets_company_scope_key` | `(company_id, scope, executive_id, year, month)` | **Unique** |
| `sales_module_targets_company_id_idx` | `company_id` | Index |
| `sales_module_targets_executive_id_idx` | `executive_id` | Index |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |
| `executive_id` | `users(id)` | `CASCADE` |
| `created_by_id` | `users(id)` | `RESTRICT` |
| `updated_by_id` | `users(id)` | `RESTRICT` |

**Resolution order (no extra table):**

```text
MONTHLY_OVERRIDE (exec + year + month)
  → EXECUTIVE_DEFAULT (exec)
    → COMPANY_DEFAULT (company)
      → 3000 hard default if no row
```

**Reason:** PRD monthly target widget separate from Module Mastery.

**Rollback:** `DROP TABLE sales_module_targets;`

**Seed:** One `COMPANY_DEFAULT` row per company with `target_modules = 3000`.

---

### 4.6 `sales_dashboard_config`

**Prisma model:** `SalesDashboardConfig`  
**Purpose:** Per-company risk/work-queue thresholds (PRD §35). Avoids polluting `companies` with many nullable columns.

| Field | Type | Nullable | Default | Notes |
|---|---|---:|---|---|
| `id` | `UUID` | No | `uuid()` | PK |
| `company_id` | `UUID` | No | — | FK → `companies.id`, **unique** |
| `quiet_customer_days` | `Int` | No | `7` | Inactivity threshold |
| `stuck_pi_draft_days` | `Int` | No | `7` | PI in `DRAFT` too long |
| `stuck_pi_issued_days` | `Int` | No | `14` | Issued, no payment |
| `stuck_pi_partial_days` | `Int` | No | `30` | Partially paid too long |
| `expiring_quotation_soon_days` | `Int` | No | `3` | Matches `QUOTATION_VALIDITY_DAYS` |
| `stock_watch_max_products` | `Int` | No | `10` | Limit widget rows |
| `created_at` | `Timestamptz` | No | `now()` | |
| `updated_at` | `Timestamptz` | No | `@updatedAt` | |

**Indexes:**

| Name | Columns | Type |
|---|---|---|
| PK | `id` | Primary key |
| `sales_dashboard_config_company_id_key` | `company_id` | **Unique** |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `company_id` | `companies(id)` | `CASCADE` |

**Reason:** Configurable quiet customer and stuck PI thresholds without code deploy.

**Rollback:** `DROP TABLE sales_dashboard_config;`

**Alternative considered:** Add columns to `companies` — rejected to keep company model focused and allow future dashboard settings growth.

---

## 5. Prisma Relation Additions (existing models)

Add reverse relations only — **no new columns** on operational models:

**`Company`:**

```text
moduleMasteryConfig       ModuleMasteryConfig?
moduleMasteryLevels       ModuleMasteryLevel[]
moduleMasteryProgress     ExecutiveModuleMasteryProgress[]
moduleLevelAchievements   ExecutiveModuleLevelAchievement[]
salesModuleTargets        SalesModuleTarget[]
salesDashboardConfig      SalesDashboardConfig?
```

**`User`:**

```text
moduleMasteryProgress     ExecutiveModuleMasteryProgress[]
moduleLevelAchievements   ExecutiveModuleLevelAchievement[]
salesModuleTargets        SalesModuleTarget[]  // as executive
```

---

## 6. Performance Indexes (Existing Tables)

Recommended in a **separate migration** after Command 15 profiling, or included if team prefers upfront optimization.

### 6.1 `dispatches`

| Index | Columns | Reason |
|---|---|---|
| `dispatches_company_status_dispatch_date_idx` | `(company_id, status, dispatch_date)` | Module mastery recalc, today's dispatch, trend charts, team scoreboard |

**Existing:** `(company_id, status)`, `(proforma_invoice_id)` — composite adds date range scans.

### 6.2 `quotations`

| Index | Columns | Reason |
|---|---|---|
| `quotations_company_sales_user_quotation_date_idx` | `(company_id, sales_user_id, quotation_date)` | Executive KPI aggregation |
| `quotations_company_status_expiry_date_idx` | `(company_id, status, expiry_date)` | Expiring quotation work queue |

**Existing:** `(company_id, status)` — insufficient for executive + date filters.

### 6.3 `proforma_invoices`

| Index | Columns | Reason |
|---|---|---|
| `proforma_invoices_company_sales_user_pi_date_idx` | `(company_id, sales_user_id, pi_date)` | PI KPI + team scoreboard |

**Existing:** `(company_id, status)`, `(company_id, dispatch_today_date)`.

### 6.4 `dispatch_lines`

**No new index in v1.** Queries filter via `dispatches` parent; join on `dispatch_id` uses existing `(dispatch_id)` index.

### 6.5 `payments`

**No new index in v1.** Existing `(company_id, payment_date)` and `(proforma_invoice_id)` sufficient for collection aggregation.

---

## 7. Migration Plan

### 7.1 Recommended migration order

```text
Migration 1: 20260820100000_sales_dashboard_config
  - Enums: ModuleMasteryResetPeriod, SalesModuleTargetScope
  - Tables: module_mastery_config, module_mastery_levels,
            executive_module_mastery_progress, executive_module_level_achievements,
            sales_module_targets, sales_dashboard_config
  - Seed: default config, 15 levels, company target 3000 per active company

Migration 2 (optional / after profiling): 20260820110000_sales_dashboard_indexes
  - Composite indexes on dispatches, quotations, proforma_invoices
```

### 7.2 Seed script responsibilities

| Data | Action |
|---|---|
| `ModuleMasteryConfig` | One row per active `Company` |
| `ModuleMasteryLevel` | 15 PRD default levels per company |
| `SalesModuleTarget` | `COMPANY_DEFAULT` = 3000 modules per company |
| `SalesDashboardConfig` | One row with PRD default thresholds per company |
| Historical progress | **Not seeded** — backfill via `recalculateAllExecutives(currentMonth)` admin action |

### 7.3 Backfill strategy

| Table | Backfill |
|---|---|
| `executive_module_mastery_progress` | Optional script: iterate executives × last N months, sum dispatches, insert progress |
| `executive_module_level_achievements` | Reconstruct from historical monthly totals if backfill requested; otherwise forward-only from go-live |

**Command 9** implements `scripts/backfill-module-mastery.ts` (optional, authorized run).

---

## 8. Rollback Considerations

| Step | Action |
|---|---|
| Rollback migration 2 | `DROP INDEX` only — zero data impact |
| Rollback migration 1 | Drop tables in order: achievements → progress → levels → targets → dashboard_config → mastery_config → drop enums |
| Application rollback | Dashboard falls back to KPI-only mode without mastery/target widgets; operational sales unaffected |
| Data loss on rollback | Achievement history and target config lost; **operational dispatch data preserved** |

All new tables are **additive** — rollback does not touch `quotations`, `proforma_invoices`, `dispatches`, or `payments`.

---

## 9. Data Integrity Rules (Application Layer)

| Rule | Enforcement |
|---|---|
| Progress.modules_dispatched ≤ sum of operational dispatches | Recalculate overwrites cache |
| Achievement.threshold_modules ≤ progress at insert time | Checked in `module-mastery-service` |
| Target scope field combinations | Zod + DB check constraint optional |
| executive_id must belong to company for targets/mastery | Validate via `UserCompany` on write |
| God level rows not in `module_mastery_levels` | Engine computes dynamically |
| Unique achievement per level per month | Unique index prevents duplicates on recalculate |

---

## 10. What Stays in Application Code Only

| Concern | Why not in DB |
|---|---|
| KPI values | Derived from operational tables |
| Funnel conversion % | Computed |
| Outstanding buckets | Computed (bucket definition may differ from stored data) |
| Team scoreboard merge | In-memory join of aggregates |
| God Level names ("God Level I") | Template string from rank + config |
| Asia/Kolkata month boundaries | `business-dates.ts` — not a DB setting in v1 |

---

## 11. Entity Relationship (New Tables)

```text
companies
  ├── module_mastery_config (1:1)
  ├── module_mastery_levels (1:N)
  ├── sales_dashboard_config (1:1)
  ├── sales_module_targets (1:N)
  ├── executive_module_mastery_progress (1:N)
  └── executive_module_level_achievements (1:N)

users (executives)
  ├── executive_module_mastery_progress (1:N)
  ├── executive_module_level_achievements (1:N)
  └── sales_module_targets (1:N, as executive)

dispatches / dispatch_lines  ──(source of truth)──►  progress + achievements
                              (no FK — intentional)
```

---

## 12. Review Checklist Before Running Migration

- [ ] Confirm `company_id` on all mastery rows (multi-company executives)
- [ ] Confirm seed level thresholds use `slab_size` from config
- [ ] Confirm unique constraints handle God levels (`god_level_rank`)
- [ ] Confirm rollback tested on staging
- [ ] Confirm no FK from mastery tables to `dispatches` (projection must not block dispatch deletes)
- [ ] Profile team scoreboard query before adding migration 2 indexes
- [ ] Product sign-off on achievement backfill scope (forward-only vs historical)

---

## 13. Next Step

**Command 5:** Implement centralized analytics layer (`report-builders.ts`, `sales-dashboard` services) — **no migration required for KPI work**. Run **Migration 1** before Command 8 (targets) and Command 9 (Module Mastery engine).
