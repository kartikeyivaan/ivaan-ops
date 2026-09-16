-- Allow a serial number to return after a completed exit as a new inventory cycle.
-- At most one live (in-stock / booked / damaged / damage-pending) row may exist.

DROP INDEX IF EXISTS "inventory_serials_serial_number_key";

CREATE INDEX IF NOT EXISTS "inventory_serials_serial_number_idx"
  ON "inventory_serials"("serial_number");

CREATE UNIQUE INDEX "inventory_serials_live_serial_number_key"
  ON "inventory_serials"("serial_number")
  WHERE "status" IN ('AVAILABLE', 'BOOKED', 'DAMAGED', 'DAMAGE_PENDING');
