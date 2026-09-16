-- Optional warehouse physical challan number on delivery challans.
ALTER TABLE "dispatches" ADD COLUMN "physical_challan_number" TEXT;
