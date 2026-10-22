# Ivaan Demo Company

Buyer-facing sandbox on the same app (`app.ivaansolar`) as live ops.

## What it is

| Item | Value |
|------|--------|
| Company | **Ivaan Demo** (`DEMO`) |
| Flag | `companies.is_demo = true` |
| Demo login | `demo@ivaansolar.com` / `Demo@Ivaan1` |
| User flag | `users.is_demo = true` (no Super Admin) |
| Data | **5 shared Demo Customers** (`DEMO-CUST-001`…`005`) + **5 shared Demo Vendors** + **per demo user:** 5 QT + 5 PI + 5 DC + 5 documentation records |

Demo users see **only** Ivaan Demo. Staff JWTs never include DEMO. Learning Mode is blocked for demo accounts. Live DCR portal automation cannot start from DEMO.

Customers are a global master: demo sessions list only `DEMO-*` customers (never live ISE/PCMV firms). Live company sessions exclude demo customers.

Vendors are also a global master: demo sessions list only Demo Vendors (name/`DEMO` GST markers). Live company sessions exclude those demo supplier rows.

### Document labelling

Every demo-company document must show **Demo Company Record**:

- PDF header band + footer (quotations, PIs, delivery challans)
- In-app detail pages (QT / PI / DC / documentation)
- Shell banner while in Ivaan Demo
- Seeded notes/remarks on sample chains

### Super Admin: create / delete demo users

1. **Create:** Admin → Users → assign **only Ivaan Demo**, roles without Super Admin → `isDemo` is set and a 5× sample sales chain is seeded automatically.
2. **Delete:** Demo users can be hard-deleted; their sample ownership is reassigned to another demo user (usually `demo@ivaansolar.com`). The last remaining demo user is deactivated instead.

## Seed / reset

Requires roles + product masters from the main seed first (once):

```bash
npm run db:seed
```

Re-seed or refresh demo sample data anytime (idempotent upserts):

```bash
npm run db:seed:demo
```

After many buyer walkthroughs leave junk in DEMO, run `db:seed:demo` again. It refreshes company profile, demo user roles/password, ensures the 5 shared Demo Customers and 5 Demo Vendors, detaches any live firms from demo users, and ensures the sample sales chain exists. It does **not** delete buyer-created quotations; for a hard wipe, delete DEMO company-scoped rows in the DB (or restore from backup) then re-run `db:seed:demo`.

## Isolation rules

- Demo user ↔ DEMO company only (enforced in auth JWT + `/api/users` create/update)
- Staff must not be assigned DEMO (API rejects mixed / staff-on-demo membership)
- Reports / All-companies aggregates exclude `isDemo`
- Cross-company stock candidates exclude DEMO
- `npm run db:seed` also wires Learning practice links for staff only (`isDemo: false`)

## Rotate buyer password

Update via Admin → Users (edit demo user password) or re-run `db:seed:demo` (resets to `Demo@Ivaan1`).
