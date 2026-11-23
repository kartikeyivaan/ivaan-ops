-- Under-investigation serials stay in the system and must still count as a live copy
-- of their serial number, so the live-uniqueness rule includes them.
DROP INDEX IF EXISTS "inventory_serials_live_serial_number_key";

CREATE UNIQUE INDEX "inventory_serials_live_serial_number_key"
  ON "inventory_serials"("serial_number")
  WHERE "status" IN ('AVAILABLE', 'BOOKED', 'DAMAGED', 'DAMAGE_PENDING', 'UNDER_INVESTIGATION');
