# Prompt 02 — Customer Management

Implements Sprint 1 customer module per PRD v3.0.

## Features

- Company-scoped customers (ISE / PCMV)
- Customer types: Dealer, Project
- Duplicate GST blocked per company (BR-005)
- Assigned sales executive (company-owned customers, BR-003)
- Bulk reassignment (Super Admin + Sales Manager, BR-004)
- Search/filter by name, GST, city, type, executive
- Customer profile tabs: Overview, Contacts, Quotations, PI, Payments, Dispatches
- Excel import wizard with preview/validation/import
- Outstanding metrics placeholder until Prompt 07 (BR-012)
- RBAC enforced in UI and API
- Audit logs on create, update, import, reassignment

## Routes

| Route | Purpose |
|-------|---------|
| `/sales/customers` | Customer list |
| `/sales/customers/new` | Create customer |
| `/sales/customers/[id]` | Customer profile |
| `/sales/customers/[id]/edit` | Edit customer |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/customers` | List/search customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/{id}` | Customer detail |
| PATCH | `/api/customers/{id}` | Edit customer |
| POST | `/api/customers/import` | Preview/import Excel rows |
| POST | `/api/customers/reassign` | Bulk reassignment |
| GET | `/api/users/sales-executives` | Sales users for assignment |

## Database migration

After Neon is configured:

```bash
npm run db:migrate
npm run db:seed
```

This applies migration `20250614120000_customers` and seeds 3 sample customers.

## Excel import columns

`customer_name`, `customer_type`, `gst_number`, `address`, `city`, `state`, `mobile`, `email`, `assigned_sales_email`, `contact_name`, `contact_designation`, `contact_mobile`, `contact_email`

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Sales Executive | sales@ivaansolar.com | Sales@123 |

## Next prompt

Prompt 03 — Product Management.
