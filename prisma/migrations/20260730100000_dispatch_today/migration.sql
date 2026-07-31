-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'DISPATCH_TODAY';

-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN     "dispatch_today_date" DATE,
ADD COLUMN     "dispatch_today_marked_at" TIMESTAMP(3),
ADD COLUMN     "dispatch_today_marked_by" UUID,
ADD COLUMN     "dispatch_draft_vehicle_no" TEXT,
ADD COLUMN     "dispatch_draft_driver_name" TEXT,
ADD COLUMN     "dispatch_draft_receiver_name" TEXT,
ADD COLUMN     "dispatch_draft_receiver_mobile" TEXT,
ADD COLUMN     "dispatch_draft_notes" TEXT;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_dispatch_today_marked_by_fkey" FOREIGN KEY ("dispatch_today_marked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "proforma_invoices_company_id_dispatch_today_date_idx" ON "proforma_invoices"("company_id", "dispatch_today_date");
