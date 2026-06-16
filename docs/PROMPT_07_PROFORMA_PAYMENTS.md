# Prompt 07 — PI, Payments & Booking

Implements proforma invoices, payment recording, and booking approval per PRD v3.0.

## Features

- Proforma invoice from sent quotation or direct entry
- Document numbering: `{COMPANY}-PI-{FY}-{SEQUENCE}` (e.g. `ISE-PI-26-27-00001`)
- Quotation marked CONVERTED when PI is created from it
- Payment recording against issued PIs with outstanding tracking (BR-012)
- 50% advance required before booking request
- Sales Manager booking approval reserves inventory (BOOK transactions)
- Customer profile PI and Payments tabs with live outstanding metrics
- PDF generation for issued PIs
- RBAC: Sales manage PIs; Accounts record payments; Manager approves booking
- Audit logs on PI create/issue, payments, and booking approval

## Routes

| Route | Purpose |
|-------|---------|
| `/sales/proforma-invoices` | PI list with filters |
| `/sales/proforma-invoices/new` | Direct PI builder |
| `/sales/proforma-invoices/[id]` | View, issue, payments, booking |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/proforma-invoices` | List / create PI |
| GET | `/api/proforma-invoices/[id]` | PI detail |
| POST | `/api/proforma-invoices/[id]/issue` | Issue draft PI |
| POST | `/api/proforma-invoices/[id]/payments` | Record payment |
| POST | `/api/proforma-invoices/[id]/request-booking` | Request booking (50% advance) |
| POST | `/api/proforma-invoices/[id]/approve-booking` | Approve booking & reserve stock |
| GET | `/api/proforma-invoices/[id]/pdf` | Generate PI PDF |
| POST | `/api/quotations/[id]/convert-to-pi` | Convert sent quotation to PI |

## Permissions

| Action | Roles |
|--------|-------|
| View PIs | Super Admin, Sales Manager, Sales Executive, Warehouse, Accounts |
| Create / issue / request booking | Super Admin, Sales Manager, Sales Executive |
| Record payments | Super Admin, Sales Manager, Accounts |
| Approve booking | Super Admin, Sales Manager |
| View PIs | Purchase — no access |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250614220000_proforma_payments` and seeds sample PI with 50% payment plus pending booking approval.

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Sales Executive | sales@ivaansolar.com | Sales@123 |
| Sales Manager | manager@ivaansolar.com | Manager@123 |
| Accounts | accounts@ivaansolar.com | Accounts@123 |

## Workflow

1. Sales converts sent quotation to PI (or creates direct PI)
2. Accounts records customer payments against PI
3. When payments reach 50%, Sales requests booking with warehouse selection
4. Sales Manager approves booking — stock is reserved (BOOK)
5. Customer outstanding updates live on profile (PI value − payments)

## Next prompt

Prompt 09 — Reports (5 reports with Excel/PDF export).
