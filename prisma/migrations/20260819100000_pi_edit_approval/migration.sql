-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'PI_EDIT';

-- CreateEnum
CREATE TYPE "PiEditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "proforma_invoice_edit_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pi_id" UUID NOT NULL,
    "proposed_customer_id" UUID NOT NULL,
    "proposed_notes" TEXT,
    "proposed_issue" BOOLEAN NOT NULL DEFAULT false,
    "proposed_total_value" DECIMAL(14,2) NOT NULL,
    "proposed_lines" JSONB NOT NULL,
    "status" "PiEditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoice_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proforma_invoice_edit_requests_company_id_status_idx" ON "proforma_invoice_edit_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "proforma_invoice_edit_requests_pi_id_status_idx" ON "proforma_invoice_edit_requests"("pi_id", "status");

-- AddForeignKey
ALTER TABLE "proforma_invoice_edit_requests" ADD CONSTRAINT "proforma_invoice_edit_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_edit_requests" ADD CONSTRAINT "proforma_invoice_edit_requests_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_edit_requests" ADD CONSTRAINT "proforma_invoice_edit_requests_proposed_customer_id_fkey" FOREIGN KEY ("proposed_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_edit_requests" ADD CONSTRAINT "proforma_invoice_edit_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_edit_requests" ADD CONSTRAINT "proforma_invoice_edit_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
