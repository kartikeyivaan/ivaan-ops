-- AlterTable
ALTER TABLE "inventory_monthly_audits" ADD COLUMN     "investigation_closed_at" TIMESTAMP(3),
ADD COLUMN     "investigation_closed_by" UUID;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audits" ADD CONSTRAINT "inventory_monthly_audits_investigation_closed_by_fkey" FOREIGN KEY ("investigation_closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

