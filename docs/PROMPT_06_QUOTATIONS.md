# Prompt 06 — Quotations

Implements Excel-style quotation builder with PDF generation per PRD v3.0.

## Features

- Quotation builder with customer header, product grid, WP/unit pricing, GST, totals
- Document numbering: `{COMPANY}-QT-{FY}-{SEQUENCE}` (e.g. `ISE-QT-26-27-00001`)
- Fixed 3-day validity from quotation date (BR-007)
- Below-minimum pricing flagged per line; Sales Manager approval required before send
- Revision history — revisions create new records, never overwrite (BR-009)
- PDF regenerated from data with company bank details, terms, and signature placeholder (BR-038)
- Customer profile quotations tab with history
- RBAC: Sales manage; Warehouse/Accounts view; Purchase no access
- Audit logs on create, send, revise, and price approval

## Routes

| Route | Purpose |
|-------|---------|
| `/sales/quotations` | Quotation list with filters |
| `/sales/quotations/new` | Quotation builder |
| `/sales/quotations/[id]` | View, send, approve pricing, PDF, revisions |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/quotations` | List / create quotation |
| GET | `/api/quotations/[id]` | Quotation detail |
| POST | `/api/quotations/[id]/send` | Send draft quotation |
| POST | `/api/quotations/[id]/revise` | Create revision |
| POST | `/api/quotations/[id]/approve-price` | Approve below-minimum pricing |
| GET | `/api/quotations/[id]/pdf` | Generate PDF |

## Permissions

| Action | Roles |
|--------|-------|
| View quotations | Super Admin, Sales Manager, Sales Executive, Warehouse, Accounts |
| Create / send / revise | Super Admin, Sales Manager, Sales Executive |
| Approve below-minimum pricing | Super Admin, Sales Manager |
| View quotations | Purchase — no access |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250614200000_quotations` and seeds sample sent + pending-approval quotations for ISE.

## Seed logins (quotations)

| Role | Email | Password |
|------|-------|----------|
| Sales Executive | sales@ivaansolar.com | Sales@123 |
| Sales Manager | manager@ivaansolar.com | Manager@123 |

## Workflow

1. Sales Executive creates quotation for a customer with module/inverter lines
2. Standard rates pre-fill from product price master
3. If rate is below minimum, save as draft and request manager approval
4. Sales Manager approves pricing; executive sends quotation
5. Download PDF for customer sharing
6. Revise sent quotation to create a new revision record

## Next prompt

Prompt 08 — Dispatch & DC PDF (dispatch from booked stock, serial scan, partial dispatch).
