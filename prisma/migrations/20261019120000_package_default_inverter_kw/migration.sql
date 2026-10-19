-- AlterTable
ALTER TABLE "proposal_package_master"
ADD COLUMN "default_inverter_kw" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- Backfill from marketed system size when present; otherwise panel-count heuristic.
UPDATE "proposal_package_master"
SET "default_inverter_kw" = CASE
  WHEN "system_kw" > 0 THEN "system_kw"
  WHEN "panel_count" >= 9 THEN 5
  WHEN "panel_count" > 0 THEN 3
  ELSE 0
END;
