# Prompt 05 — Transfers

Implements inter-warehouse and inter-company stock transfers with receive confirmation per PRD v3.0.

## Features

- Draft transfer creation with multi-line products
- Inter-warehouse transfers within the same company
- Inter-company transfers across user-accessible companies
- Dispatch step deducts source stock (serials → DISPATCHED, non-serial qty reduced)
- Receive confirmation at destination (partial receive for non-serial products)
- Serial-tracked lines must be received in full
- Transfer document numbering via `DocumentSequence` (`TRF-{FY}-{sequence}`)
- TRANSFER ledger entries on dispatch and receive
- RBAC: Sales cannot see serial numbers on transfers
- Super Admin can cancel draft transfers

## Routes

| Route | Purpose |
|-------|---------|
| `/inventory/transfers` | Transfer list (outgoing / incoming filters) |
| `/inventory/transfers/new` | Create draft transfer |
| `/inventory/transfers/[id]` | View, dispatch, receive, or cancel |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/inventory/transfers` | List / create transfers |
| GET/DELETE | `/api/inventory/transfers/[id]` | Detail / cancel draft |
| POST | `/api/inventory/transfers/[id]/dispatch` | Dispatch transfer |
| POST | `/api/inventory/transfers/[id]/receive` | Receive confirmation |
| GET | `/api/inventory/transfers/serials` | Available serials for line |

## Permissions

| Action | Roles |
|--------|-------|
| View transfers | All business roles |
| View serial numbers | Super Admin, Warehouse, Purchase |
| Create / dispatch / receive | Super Admin, Warehouse |
| Cancel draft | Super Admin only |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250614180000_transfers` and seeds available stock for transfer testing.

## Seed logins (transfers)

| Role | Email | Password |
|------|-------|----------|
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |
| Super Admin | admin@ivaansolar.com | Admin@123 |

## Workflow

1. Warehouse user (ISE) creates draft: Jalgaon HO → Jalgaon Projects
2. Dispatch deducts stock at source
3. Receive at destination confirms quantities
4. For inter-company: switch active company to destination, then receive

## Next prompt

Prompt 07 — PI, Payments & Booking (proforma invoice, 50% advance, booking approval).
