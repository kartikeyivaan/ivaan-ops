-- CreateEnum
CREATE TYPE "PiCreditStatus" AS ENUM ('NONE', 'PENDING_SM', 'PENDING_ACCOUNTS', 'APPROVED', 'REJECTED', 'CLEARED');

-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'PI_CREDIT';
ALTER TYPE "ApprovalModuleType" ADD VALUE 'PI_CREDIT_ACCOUNTS';

-- AlterTable
ALTER TABLE "proforma_invoices"
ADD COLUMN "credit_status" "PiCreditStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "credit_notes" TEXT,
ADD COLUMN "credit_requested_at" TIMESTAMP(3),
ADD COLUMN "credit_requested_by" UUID,
ADD COLUMN "credit_sm_approved_at" TIMESTAMP(3),
ADD COLUMN "credit_sm_approved_by" UUID,
ADD COLUMN "credit_accounts_approved_at" TIMESTAMP(3),
ADD COLUMN "credit_accounts_approved_by" UUID,
ADD COLUMN "credit_due_date" DATE,
ADD COLUMN "credit_cleared_at" TIMESTAMP(3),
ADD COLUMN "credit_rejection_reason" TEXT,
ADD COLUMN "credit_last_reminder_on" DATE;

-- CreateIndex
CREATE INDEX "proforma_invoices_company_id_credit_status_idx" ON "proforma_invoices"("company_id", "credit_status");
CREATE INDEX "proforma_invoices_customer_id_credit_status_idx" ON "proforma_invoices"("customer_id", "credit_status");

-- AddForeignKey
ALTER TABLE "proforma_invoices"
ADD CONSTRAINT "proforma_invoices_credit_requested_by_fkey"
FOREIGN KEY ("credit_requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proforma_invoices"
ADD CONSTRAINT "proforma_invoices_credit_sm_approved_by_fkey"
FOREIGN KEY ("credit_sm_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proforma_invoices"
ADD CONSTRAINT "proforma_invoices_credit_accounts_approved_by_fkey"
FOREIGN KEY ("credit_accounts_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
