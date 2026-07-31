# Opening stock backfill

This command creates one active `OPENING_STOCK` inventory event for each
company, warehouse, and product combination that currently has available
physical stock. Re-running it skips an existing non-cancelled event created by
this backfill.

## Before running

- Apply the inventory-event migration and run `npm run db:generate`.
- Choose an existing user UUID. It is recorded as the event creator and audit
  performer.
- Take a database backup before the write run.

## Preview

```sh
npm run db:backfill:opening-stock -- --dry-run --user-id <user-uuid>
```

To limit the run to one company, add `--company-id <company-uuid>`. The user ID
may instead be supplied through `BACKFILL_USER_ID`.

Review `dryRunCandidates`, `zeroStockSkipped`, and
`existingEventsSkipped` in the JSON summary.

## Execute and verify

```sh
npm run db:backfill:opening-stock -- --user-id <user-uuid>
```

Run the dry-run command again. `dryRunCandidates` should be zero and previously
created combinations should appear in `existingEventsSkipped`. Also verify a
sample of `inventory_events` rows and their matching `audit_logs` entries.

Cancelled backfill events are intentionally eligible for recreation on a later
run.
