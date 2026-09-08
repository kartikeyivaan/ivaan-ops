-- Sticky "marked for dispatch at least once" flag. Survives overnight
-- dispatch-today expiry so leftover PIs stay on the sales Pending Dispatch list.

ALTER TABLE "proforma_invoices" ADD COLUMN "dispatch_queued_at" TIMESTAMP(3);
ALTER TABLE "proforma_invoices" ADD COLUMN "dispatch_queued_by" UUID;

ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_dispatch_queued_by_fkey" FOREIGN KEY ("dispatch_queued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "proforma_invoices_company_id_dispatch_queued_at_idx" ON "proforma_invoices"("company_id", "dispatch_queued_at");

-- Currently marked for today
UPDATE "proforma_invoices"
SET
  "dispatch_queued_at" = COALESCE("dispatch_today_marked_at", NOW()),
  "dispatch_queued_by" = "dispatch_today_marked_by"
WHERE "dispatch_queued_at" IS NULL
  AND "dispatch_today_date" IS NOT NULL
  AND "status" IN ('BOOKED', 'PARTIALLY_DISPATCHED', 'CANCEL_PENDING');

-- Already partially shipped (must have been marked to create a DC)
UPDATE "proforma_invoices"
SET "dispatch_queued_at" = COALESCE("booked_at", "created_at")
WHERE "dispatch_queued_at" IS NULL
  AND "status" = 'PARTIALLY_DISPATCHED';

-- Historical "mark for dispatch today" from audit (first time)
UPDATE "proforma_invoices" AS pi
SET "dispatch_queued_at" = src.first_marked_at
FROM (
  SELECT DISTINCT ON ("record_id")
    "record_id",
    "performed_at" AS first_marked_at
  FROM "audit_logs"
  WHERE "table_name" = 'proforma_invoices'
    AND "new_value"::text LIKE '%dispatchTodayDate%'
  ORDER BY "record_id", "performed_at" ASC
) AS src
WHERE pi.id = src.record_id
  AND pi.dispatch_queued_at IS NULL
  AND pi.status IN ('BOOKED', 'PARTIALLY_DISPATCHED', 'CANCEL_PENDING');
