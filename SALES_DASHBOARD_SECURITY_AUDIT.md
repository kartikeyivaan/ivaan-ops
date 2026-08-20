# Sales Dashboard — Security Audit

**Date:** 20 August 2026  
**Command:** 14  
**Scope:** Authorization and data isolation for Sales Executive / Sales Manager / Super Admin dashboard, reports, Module Mastery, targets, and related list drill-downs.

---

## 1. Summary

| Verdict | Detail |
|---|---|
| **Overall** | Pass after Critical/High list-API isolation fixes in this command |
| **Critical fixed** | PI + Quotation list APIs now hard-enforce `restrictSalesUserId` |
| **High fixed** | PI list page no longer allows `salesUserId=all` / peer executive browsing for Sales Executives |
| **Accepted Medium** | Document detail-by-UUID remains company-scoped (ops roles need shared PI/DC access); executives still cannot discover peers via lists/reports/dashboard |

---

## 2. Threat model (in scope)

| Threat | Expected control |
|---|---|
| Sales Executive views another executive’s KPIs / lists / reports | Server-side `restrictSalesUserId` / `resolveRestrictToUserId` |
| Sales Executive opens `/dashboard/executive/{otherId}` | Redirect — managers only |
| Sales Executive manipulates `?salesUserId=` / `salesUserId=all` | Ignored; forced to self |
| Cross-company data access | `requireActiveCompany` + query `companyId` |
| Unauthenticated API access | `auth()` → 401 |
| Wrong role on report / targets / mastery recalc | Role gates → 403 |
| Celebrate / ack as another user | Celebrate always uses restricted self ID |

Out of scope for this audit: general CSRF/session hardening, XSS, infra secrets, warehouse/accounts document sharing policy beyond sales isolation.

---

## 3. Control inventory

### 3.1 Helpers

| Helper | Behavior |
|---|---|
| `canViewSalesDashboard` | Super Admin, Sales Manager, Sales Executive |
| `canViewTeamSalesDashboard` | Super Admin, Sales Manager |
| `canViewExecutivePerformanceDetail` | Self **or** team viewers |
| `resolveRestrictToUserId` | Executive → self; manager/admin → `null` |
| `restrictSalesUserId` | Executive → always self; manager/admin → requested; others → requested |
| `parseReportRequest` | Auth + company + `restrictSalesUserId` |
| `resolveSalesDashboardScope` | Role + company + restrict flags |

### 3.2 Surfaces checked

| Surface | Auth | Company | Executive isolation | Status |
|---|---|---|---|---|
| `GET /api/dashboard` | Yes | Yes | Scope restrict | Pass |
| Module Mastery GET/journey | Yes | Yes | Self unless manager | Pass |
| Module Mastery celebrate | Yes | Yes | Always self | Pass |
| Module Mastery recalculate | Manager+ | Yes | Team / single | Pass |
| Report APIs (incl. Command 12) | Yes | Yes | `restrictSalesUserId` | Pass |
| Sales targets API/page | Manager+ | Yes | N/A | Pass |
| `/dashboard/executive/[id]` | Manager+ | Membership check | Executives blocked | Pass |
| Quotations list **page** | Yes | Yes | Hard restrict | Pass |
| Quotations list **API** | Yes | Yes | Hard restrict (**fixed**) | Pass |
| PI list **page** | Yes | Yes | Hard restrict (**fixed**) | Pass |
| PI list **API** | Yes | Yes | Hard restrict (**fixed**) | Pass |
| Dispatches list API / challans | Yes | Yes | Hard restrict | Pass |
| Quotation/PI **create** attribution | Yes | Yes | Force self for executives (**fixed**) | Pass |

---

## 4. Findings

### Fixed in Command 14

| ID | Severity | Finding | Remediation |
|---|---|---|---|
| F1 | Critical | `GET /api/proforma-invoices` accepted any `salesUserId` / omitted filter for executives | Apply `restrictSalesUserId` before `listProformaInvoices` |
| F2 | Critical | PI page used soft `defaultSalesListFilterUserId` + `salesUserId=all` allowing company-wide browse | Hard restrict + hide executive filter unless team viewer |
| F3 | High | `GET /api/quotations` missing restrict (SSR page was safe; client refetch was not) | Apply `restrictSalesUserId` |
| F4 | Medium | Create Quotation/PI could attribute to another `salesUserId` for executives | Force via `restrictSalesUserId` on POST |

### Remaining / accepted

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | Medium | PI/Quotation/DC **detail by UUID** is company-scoped, not owner-scoped | **Accepted for v1** — Warehouse/Accounts/Managers need shared document access. Lists/reports/dashboard no longer expose peer IDs to executives. Revisit if product requires owner-only detail URLs. |
| R2 | Low | Module Mastery APIs do not re-check target user ∈ company (executive page does) | Monitor; managers are trusted within company switcher |
| R3 | Low | `defaultSalesListFilterUserId` retained as thin wrapper over restrict for UX defaults | Documented deprecated for auth use |

---

## 5. Authorization test coverage

| Test file | Covers |
|---|---|
| `src/lib/report-permissions.test.ts` | Report role gates + `restrictSalesUserId` forces executive self |
| `src/lib/sales-dashboard/dashboard-permissions.test.ts` | Dashboard/team/detail/restrict helpers (**added**) |
| `src/lib/sales-target-service.test.ts` | Target manage/view roles |
| `src/lib/module-mastery-service.test.ts` | Calculation only (auth on routes) |

Recommended follow-up (Command 15 validation): HTTP-level tests that executive GET list APIs ignore foreign `salesUserId`.

---

## 6. Role matrix (sales data)

| Capability | Sales Executive | Sales Manager | Super Admin |
|---|---|---|---|
| Own executive dashboard | Yes | No (team view) | No (team view) |
| Team / manager dashboard | No | Yes | Yes |
| `/dashboard/executive/{id}` | No | Yes | Yes |
| Peer `salesUserId` on lists/reports | Forced self | Allowed | Allowed |
| Module Mastery journey of peer | No | Yes | Yes |
| Recalculate mastery | No | Yes | Yes |
| Manage sales targets | No | Yes | Yes |

---

## 7. Sign-off checklist

- [x] Server-side isolation on dashboard APIs  
- [x] Server-side isolation on report APIs  
- [x] Server-side isolation on quotation / PI / dispatch list APIs  
- [x] Executive cannot open peer performance page by URL  
- [x] Celebrate cannot target another user  
- [x] Targets / recalculate gated to manager+  
- [x] Permission unit tests for dashboard helpers  
- [ ] Optional: owner checks on document detail routes (deferred R1)

---

## 8. Next

**Command 15** — Final validation report (`SALES_DASHBOARD_IMPLEMENTATION_REPORT.md`) including formula/date/role acceptance checks.
