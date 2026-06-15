# Prompt 01 — Manual QA Checklist

## Setup

- [ ] `.env` created from `.env.example`
- [ ] `npm install` completes without errors
- [ ] `npm run db:migrate` applies foundation migration
- [ ] `npm run db:seed` creates companies, warehouses, users
- [ ] `npm run dev` starts on port 3000

## Authentication

- [ ] Login page loads at `/login`
- [ ] Valid admin credentials sign in successfully
- [ ] Invalid password shows error message
- [ ] Inactive user cannot sign in
- [ ] Sign out returns to login page
- [ ] Protected routes redirect unauthenticated users to login

## Company context

- [ ] Admin user with both companies sees company switcher
- [ ] Switching company updates dashboard context label
- [ ] User with one company sees company badge without dropdown
- [ ] User cannot access company they are not assigned to

## Role-based navigation

- [ ] Super Admin sees Users, Companies, Warehouses, Audit Logs
- [ ] Sales Manager sees Warehouses (view) but not Users
- [ ] Warehouse user sees Dashboard only (foundation scope)
- [ ] Direct URL to `/admin/users` redirects non-admin users

## User management

- [ ] Super Admin can create a new user with roles and companies
- [ ] Duplicate email is rejected
- [ ] New user appears in users table
- [ ] User create action writes audit log entry

## Company master

- [ ] ISE and PCMV appear in companies table
- [ ] Warehouse count displays per company

## Warehouse master

- [ ] Jalgaon HO and Jalgaon Projects seeded for ISE
- [ ] Super Admin can create a new warehouse
- [ ] Warehouse list shows company code and status

## Audit logs

- [ ] Login events appear in audit log
- [ ] User and warehouse create/update events are recorded
- [ ] Audit page shows performer name and timestamp

## Dashboard

- [ ] Role-based placeholder widgets render
- [ ] Active company name shown in header area

## Tests

- [ ] `npm run test` passes RBAC and validation tests

## Security notes for production

- [ ] Change all seed passwords
- [ ] Use unique `AUTH_SECRET` per environment
- [ ] Use separate Neon databases for dev/staging/production
