-- Allow sales to close a partially dispatched PI and release leftover booked qty
-- (e.g. pallet / vehicle capacity left remaining units undelivered).

-- AlterEnum
ALTER TYPE "ProformaInvoiceStatus" ADD VALUE 'CLOSED_PARTIAL';

-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN "closed_at" TIMESTAMP(3);
ALTER TABLE "proforma_invoices" ADD COLUMN "closed_by" UUID;
ALTER TABLE "proforma_invoices" ADD COLUMN "closed_remarks" TEXT;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
