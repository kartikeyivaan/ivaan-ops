# Prompt 10 — UAT Tests

Automated unit tests and a consolidated UAT checklist for all Sprint 1 modules per PRD v3.0 doc 09.

## Features

- Cross-module automated tests covering permissions, business rules, and navigation matrix
- Master UAT checklist combining Prompts 01–09 manual QA items
- End-to-end golden-path scenario (customer → dispatch → reports)
- Role smoke tests for all six Sprint 1 roles
- Sign-off table for manual UAT with testers

## Automated test coverage

| Module | Test file | Focus |
|--------|-----------|-------|
| Foundation | `rbac.test.ts`, `validations.test.ts` | Roles, nav access, form validation |
| Customers | `customers.test.ts` | GST, permissions, outstanding metrics |
| Products | `products.test.ts` | Display name, pricing type, permissions |
| Inventory | `inventory.test.ts` | FY numbering, inward validation, permissions |
| Transfers | `transfer.test.ts` | Transfer permissions, numbering |
| Quotations | `quotations.test.ts`, `quotation-permissions.test.ts` | Line totals, validity, permissions |
| PI & Payments | `pi.test.ts` | 50% advance, outstanding (BR-012), permissions |
| Dispatch | `dispatch.test.ts` | Partial qty, permissions |
| Reports | `reports.test.ts`, `report-permissions.test.ts` | KPI calculations, report access |
| Cross-module | `uat.test.ts` | Nav matrix, company access, rule consistency |

## Prerequisites

Prompts 01–09 must be complete. All migrations applied and seed data loaded.

```bash
npm run db:migrate
npm run db:seed
npm run test
npm run build
```

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@ivaansolar.com | Admin@123 |
| Sales Manager | manager@ivaansolar.com | Manager@123 |
| Sales Executive | sales@ivaansolar.com | Sales@123 |
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |
| Purchase | purchase@ivaansolar.com | Purchase@123 |
| Accounts | accounts@ivaansolar.com | Accounts@123 |

## UAT workflow

1. Run `npm run test` — all automated tests must pass before manual UAT
2. Start dev server: `npm run dev`
3. Walk through [PROMPT_10_QA_CHECKLIST.md](./PROMPT_10_QA_CHECKLIST.md) with two testers
4. Complete the golden-path scenario end-to-end
5. Sign off each module in the checklist sign-off table

## Module checklists

Per-module detail is in the individual QA checklists:

- [PROMPT_01_QA_CHECKLIST.md](./PROMPT_01_QA_CHECKLIST.md) — Foundation
- [PROMPT_02_QA_CHECKLIST.md](./PROMPT_02_QA_CHECKLIST.md) — Customers
- [PROMPT_03_QA_CHECKLIST.md](./PROMPT_03_QA_CHECKLIST.md) — Products
- [PROMPT_04_QA_CHECKLIST.md](./PROMPT_04_QA_CHECKLIST.md) — Inventory
- [PROMPT_05_QA_CHECKLIST.md](./PROMPT_05_QA_CHECKLIST.md) — Transfers
- [PROMPT_06_QA_CHECKLIST.md](./PROMPT_06_QA_CHECKLIST.md) — Quotations
- [PROMPT_07_QA_CHECKLIST.md](./PROMPT_07_QA_CHECKLIST.md) — PI & Payments
- [PROMPT_08_QA_CHECKLIST.md](./PROMPT_08_QA_CHECKLIST.md) — Dispatch
- [PROMPT_09_QA_CHECKLIST.md](./PROMPT_09_QA_CHECKLIST.md) — Reports

## Next prompt

Prompt 11 — Deploy to Vercel + Neon (staging and production go-live per PRD doc 11).
