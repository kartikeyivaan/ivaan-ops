# Prompt 03 — Manual QA Checklist

## Setup

- [ ] Run `npm run db:migrate` for products migration
- [ ] Run `npm run db:seed` for categories, brands, sample products

## Permissions

- [ ] Sales Executive can view products but not edit
- [ ] Purchase can create/edit products and manage pricing
- [ ] Warehouse can edit products but not pricing
- [ ] Sales Manager can edit products and manage pricing
- [ ] Accounts can view products and prices only

## Product CRUD

- [ ] Create module product with brand and technology
- [ ] Display name auto-generates correctly
- [ ] Module uses WP pricing type
- [ ] Inverter/Other use UNIT pricing type
- [ ] Serial tracking enabled for Modules and Inverters only
- [ ] Edit product updates display name
- [ ] Deactivate product via isActive flag

## Pricing

- [ ] Add initial price on product create (authorized roles)
- [ ] Add new price from product profile
- [ ] Previous price gets effective_to when new price added
- [ ] Minimum price cannot exceed standard price
- [ ] ISE and PCMV can have different prices for same product
- [ ] Price history tab shows all company prices

## List & search

- [ ] Product list shows brand, category, capacity, current price
- [ ] Stock columns show 0 placeholder
- [ ] Search by product name works
- [ ] Filter by category and brand works

## Tests

- [ ] `npm run test` passes product helper and permission tests

## Audit

- [ ] Product create/update writes audit log
- [ ] Price create writes audit log
