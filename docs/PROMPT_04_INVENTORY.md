# Prompt 04 — Inventory & Inwarding

Implements lot-based inventory per PRD v3.0.

## Features

- Incoming stock lots (Purchase creates, Warehouse receives)
- Partial inwarding with pending quantity tracking
- Serial capture for Modules and Inverters
- Available / Incoming / Booked / Damaged stock views
- Warehouse-wise split plus consolidated totals
- Inventory ledger (INWARD, DAMAGE, ADJUST transactions)
- Damage reporting during inwarding or standalone
- Super Admin stock adjustment (non-serial products)
- No negative stock validation
- RBAC: Sales cannot see serial numbers
- Mobile-friendly inwarding screen (large inputs)

## Routes

| Route | Purpose |
|-------|---------|
| `/inventory` | Stock overview with warehouse columns |
| `/inventory/incoming` | Incoming lots list + create |
| `/inventory/incoming/[id]` | Receive / partial inward |
| `/inventory/ledger` | Transaction ledger |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/inventory/stock` | Stock summary |
| GET/POST | `/api/inventory/incoming` | List / create incoming lots |
| POST | `/api/inventory/inward` | Receive material |
| GET | `/api/inventory/ledger` | Ledger entries |
| POST | `/api/inventory/damage` | Mark damaged |
| POST | `/api/inventory/adjust` | Super Admin adjustment |
| GET/POST | `/api/vendors` | Vendor master |

## Permissions

| Action | Roles |
|--------|-------|
| View stock | All business roles |
| View serial numbers | Super Admin, Warehouse, Purchase |
| Create incoming | Super Admin, Purchase |
| Inward / damage | Super Admin, Warehouse |
| Stock adjustment | Super Admin only |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250614160000_inventory` and seeds a vendor plus sample incoming lot for ISE.

## Seed logins (inventory)

| Role | Email | Password |
|------|-------|----------|
| Purchase | purchase@ivaansolar.com | Purchase@123 |
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |

## Product list integration

Product list stock columns now show live values from lots and serials instead of zero placeholders.

## Next prompt

Prompt 05 — Transfers (inter-warehouse and inter-company with receive confirmation).
