# Prompt 08 — Dispatch & DC PDF

Implements warehouse dispatch from booked PI stock with serial scan, partial dispatch, and delivery challan PDF per PRD v3.0.

## Features

- Dispatch only from PIs in BOOKED or PARTIALLY_DISPATCHED status
- Partial dispatch supported via `dispatched_qty` on PI lines
- Serial-tracked products require booked serial selection or scan lookup
- Document numbering: `{COMPANY}-DC-{FY}-{SEQUENCE}` (e.g. `ISE-DC-26-27-00001`)
- DC PDF with customer, PI, warehouse, lines, and serial numbers
- DC cancel request with Sales Manager approval (DC_CANCEL)
- Customer profile dispatches tab with dispatch value metrics
- Dashboard: Today's Dispatches (warehouse), pending DC cancels in approvals
- RBAC: Warehouse manages dispatch; Sales/Accounts view; Purchase no access
- Audit logs on dispatch create, confirm, and cancel

## Routes

| Route | Purpose |
|-------|---------|
| `/inventory/dispatches` | DC list with filters |
| `/inventory/dispatches/new` | Create dispatch from booked PI |
| `/inventory/dispatches/[id]` | View, confirm draft, PDF, cancel request |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/dispatches` | List / create & confirm dispatch |
| GET | `/api/dispatches/[id]` | DC detail |
| POST | `/api/dispatches/[id]/confirm` | Confirm draft DC |
| POST | `/api/dispatches/[id]/request-cancel` | Request DC cancellation |
| POST | `/api/dispatches/[id]/approve-cancel` | Approve DC cancellation |
| GET | `/api/dispatches/[id]/pdf` | Generate DC PDF |
| GET | `/api/dispatches/bookable-pis` | PIs ready for dispatch |
| GET | `/api/dispatches/serials` | Booked serials for PI line |
| GET | `/api/dispatches/lookup-serial` | Scan serial by number |

## Permissions

| Action | Roles |
|--------|-------|
| View dispatches | Super Admin, Sales Manager, Sales Executive, Warehouse, Accounts |
| Create / confirm dispatch | Super Admin, Warehouse |
| View serial numbers | Super Admin, Warehouse, Purchase |
| Approve DC cancel | Super Admin, Sales Manager |
| View dispatches | Purchase — no access |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250615000000_dispatches` and seeds booked PI plus sample partial dispatch.

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |
| Sales Manager | manager@ivaansolar.com | Manager@123 |

## Workflow

1. PI must be BOOKED (manager approved booking in Prompt 07)
2. Warehouse opens New Dispatch, selects booked PI
3. Enter partial qty per line; scan or select serials for modules/inverters
4. Confirm dispatch — stock moves to DISPATCHED, PI status updates
5. Download DC PDF for customer/transport
6. Optional: request DC cancel → manager approves → stock re-booked

## Next prompt

Prompt 09 — Reports & KPIs (sales, inventory, dispatch dashboards per PRD doc 08).
