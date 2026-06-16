# Prompt 09 — Reports & KPIs

Implements five operational reports with Excel and PDF export per PRD v3.0 doc 08.

## Features

- Sales Executive Report — quotation, PI, collection, dispatched value, new customers
- Payment Follow-up Report — PI outstanding with ageing buckets
- Product Movement Report — opening to closing by product and warehouse
- Booked vs Available Stock — free quantity after booked commitment
- Dispatch Report — DC lines with customer, executive, and value
- Filters per report (date range, executive, warehouse, customer type, ageing, search)
- Excel export via `xlsx`, PDF export via `pdfkit`
- Role-based access per permissions matrix
- Sales Executive scoped to own data when running sales reports

## Routes

| Route | Purpose |
|-------|---------|
| `/reports` | Reports hub with tabbed report selection |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/reports/sales-executive` | Sales executive KPI report |
| GET | `/api/reports/payment-followup` | Payment follow-up report |
| GET | `/api/reports/product-movement` | Product movement report |
| GET | `/api/reports/booked-available` | Booked vs available stock |
| GET | `/api/reports/dispatch` | Dispatch report |

Add `?format=xlsx` or `?format=pdf` for export. Default is JSON for on-screen preview.

## Permissions

| Report | Roles |
|--------|-------|
| Sales Executive | Super Admin, Sales Manager, Sales Executive (own data) |
| Payment Follow-up | Super Admin, Sales Manager, Sales Executive, Accounts |
| Product Movement | Super Admin, Sales Manager, Warehouse, Purchase |
| Booked vs Available | Super Admin, Sales Manager, Sales Executive, Warehouse |
| Dispatch | Super Admin, Sales Manager, Sales Executive, Warehouse, Accounts |

## Prerequisites

Prompts 01–08 (through dispatch) must be complete. No new database migration is required.

```bash
npm run test
npm run build
```

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Sales Manager | manager@ivaansolar.com | Manager@123 |
| Sales Executive | sales@ivaansolar.com | Sales@123 |
| Accounts | accounts@ivaansolar.com | Accounts@123 |
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |

## Workflow

1. Open **Reports** from the navigation menu
2. Select a report tab available to your role
3. Set filters and click **Run Report**
4. Export to Excel or PDF for sharing / offline review

## Next prompt

Prompt 11 — Deploy to Vercel + Neon (staging and production go-live per PRD doc 11).
