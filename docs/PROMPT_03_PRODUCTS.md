# Prompt 03 — Product Management

Implements Sprint 1 product module per PRD v3.0.

## Features

- Categories: Modules, Inverters, Other
- Brands and technologies (auto-created on product save)
- Capacity with configurable units (Wp, kW, kVA, Nos, Meter)
- Auto-generated display name
- WP pricing for Modules, unit pricing for others
- Serial tracking flag auto-set for Modules/Inverters
- Company-wise price history (landing, standard, minimum)
- No maximum price (BR-030)
- Stock columns show live inventory from lots/serials
- RBAC + audit logs

## Routes

| Route | Purpose |
|-------|---------|
| `/masters/products` | Product list |
| `/masters/products/new` | Create product |
| `/masters/products/[id]` | Product profile + price history |

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/products` | List/search products |
| POST | `/api/products` | Create product |
| GET | `/api/products/{id}` | Product detail |
| PATCH | `/api/products/{id}` | Edit product |
| GET/POST | `/api/products/{id}/prices` | Price history / add price |
| GET | `/api/product-masters` | Categories, brands, technologies |

## Permissions

| Action | Roles |
|--------|-------|
| View | All business roles |
| Edit product | Super Admin, Sales Manager, Warehouse, Purchase |
| Manage pricing | Super Admin, Sales Manager, Purchase |

## Database migration

```bash
npm run db:migrate
npm run db:seed
```

Applies `20250614140000_products` and seeds sample products with ISE/PCMV prices.

## Sample seeded products

- Modules - Longi - TOPCon - 590 Wp (WP pricing, serial tracked)
- Inverters - Growatt - 10 kW (unit pricing, serial tracked)
- Other - Polycab - 1 Meter (unit pricing)

## Next prompt

Prompt 04 — Transfers (inter-warehouse / inter-company).
