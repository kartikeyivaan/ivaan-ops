# Inventory, Dispatch, and Documentation Release Checklist

Record owner, timestamp, result, and evidence for each item.

## Pre-deploy

- [ ] Release commit and environment are approved; maintenance window announced.
- [ ] `npm test`, `npx tsc --noEmit`, and production build pass.
- [ ] UAT is signed off with no unresolved blocking defects.
- [ ] Database backup and restore test are complete.
- [ ] Current stock, booked serial, open PI, dispatch, and invoice queue totals
      are exported for reconciliation.
- [ ] Required environment variables and database permissions are present.
- [ ] No Service, Proposal, or pricing changes are included.

## Migrate

- [ ] Review the generated SQL and confirm changes are additive.
- [ ] Apply Prisma migrations using the deployment environment's standard
      migration command.
- [ ] Run `npm run db:generate` where generated Prisma client files are not
      produced by the build.
- [ ] Verify new columns, inventory event tables, working-day tables,
      notification table access, invoice handover, and documentation tables.
- [ ] Confirm application instances start without schema/client mismatch errors.

## Backfill and reconcile

- [ ] Choose an active system/operator user UUID.
- [ ] Run the opening-stock dry run:
      `npm run db:backfill:opening-stock -- --dry-run --user-id <uuid>`.
- [ ] Review candidates, skipped zero stock, and existing-event counts.
- [ ] Run the write command and repeat the dry run; candidates must be zero.
- [ ] Reconcile sample and aggregate warehouse/product stock with source totals.
- [ ] Verify matching audit rows. Do not enable projected-stock commitments if
      reconciliation differs.

## Smoke test

- [ ] Login and company selection work for every operational role.
- [ ] Documentation Executive seed/login exists in the intended environment.
- [ ] Incoming lot dates appear in the projected timeline.
- [ ] Advance, Ready Stock, Subject to Availability, and legacy booking rules work.
- [ ] Booking approval creates reservation events and working-day dispatch dates.
- [ ] A projected shortage blocks booking without partial writes.
- [ ] Serialized booking and dispatch preserve serial integrity.
- [ ] Dispatch completion creates an Accounts queue item and notifications.
- [ ] Invoice recording creates one documentation record.
- [ ] Documentation assignment, HOLD, FOR REVIEW, and completion work.
- [ ] Report shortcuts are visible only to authorised roles.

## Monitoring

- [ ] Watch application errors, transaction failures, and database latency.
- [ ] Monitor failed bookings by reason, negative projections, duplicate source
      events, dispatch confirmation failures, and notification write failures.
- [ ] Reconcile booking reservations against booked PIs daily during rollout.
- [ ] Reconcile completed dispatches against pending/invoiced handovers.
- [ ] Check unassigned and ageing documentation queues.
- [ ] Assign an owner and review time for the first-day and first-week checks.

## Rollback

1. Stop new booking and dispatch writes, and record the incident time.
2. Roll application instances back to the last compatible release.
3. Prefer forward-fix migrations. Do not drop new tables/columns while the old
   application can ignore them.
4. If data restoration is required, preserve an incident copy, restore the
   verified pre-deploy backup, and reconcile all writes after the backup time.
5. Cancel or reverse only events proven to be created by the failed release;
   never delete inventory/audit history manually.
6. Re-run stock, PI, dispatch, invoice, and documentation reconciliation before
   reopening writes.

Rollback owner:  
Decision time:  
Backup/restore reference:  
Reconciliation result:

## Known limitations

- Notifications are stored in the database; no email, push delivery, or
  notification-centre API/UI is included in this release.
- Report additions are permission-aware operational shortcuts to existing
  filtered queues/timeline; dedicated delayed-lot and documentation export
  endpoints are not included.
- Legacy delivery terms require explicit booking permission; ambiguous records
  are intentionally blocked.
- No PI cancellation/release endpoint currently exists. Reservation release must
  be wired into that authorised lifecycle when one is introduced.
- Ready Stock uses the existing working-day behaviour; no new configurable
  same-day cut-off was introduced.
- Government portal and automatic Tally invoice integrations remain out of scope.

## Release approval

- [ ] Product/UAT owner approved.
- [ ] Operations, Sales, Purchase, Warehouse, Accounts, and Documentation informed.
- [ ] Migration/backfill evidence attached.
- [ ] Monitoring and rollback owners acknowledged.

Release result: **Go / No-Go**  
Approvers/date:  
Notes:
