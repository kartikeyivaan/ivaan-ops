# IvaanOps — Prompt 01 Foundation

Sprint 1 foundation module for IvaanOps v3.0.

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn-style UI components
- Prisma + PostgreSQL (Neon)
- NextAuth (email/password, JWT session)

## What's included

- Email/password authentication
- Role-based access control (6 roles)
- Company selector (ISE / PCMV)
- User management (Super Admin)
- Company master (seeded)
- Warehouse master
- Audit logging hooks on write operations
- Protected routes via middleware
- Seed data and foundation migration
- Unit tests for RBAC and validation

## When your Neon database is ready

1. Copy `.env.example` to `.env`
2. Set values:

```env
DATABASE_URL="your-neon-connection-string"
AUTH_SECRET="run: openssl rand -base64 32"
APP_URL="http://localhost:3000"
```

3. Install and initialize:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

4. Open `http://localhost:3000`

## Seed logins

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@ivaansolar.com | Admin@123 |
| Sales Manager | manager@ivaansolar.com | Manager@123 |
| Warehouse | warehouse@ivaansolar.com | Warehouse@123 |

Change these passwords before production.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run test` | Run unit tests |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed roles, companies, warehouses, users |
| `npm run db:studio` | Open Prisma Studio |

## API routes (foundation)

- `POST /api/auth/*` — authentication
- `GET /api/companies` — list accessible companies
- `POST /api/session/company` — set active company
- `GET/POST /api/users` — user admin
- `PATCH /api/users/{id}` — edit/deactivate user
- `GET/POST /api/warehouses` — warehouse master
- `GET /api/audit` — audit log search

## Next prompt

Prompt 02 — Customer Management.

Reference `@PRD/02_Functional_Requirements_Specification_v3.docx` before starting.
