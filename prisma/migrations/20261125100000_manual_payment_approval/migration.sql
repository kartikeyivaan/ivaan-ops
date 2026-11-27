-- CreateEnum
CREATE TYPE "ManualPaymentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "payment_entry_policies" (
    "company_id" UUID NOT NULL,
    "manual_entry_blocked" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_entry_policies_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "manual_payment_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "proforma_invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "received_in_account" "ReceivedInAccount",
    "reference_no" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ManualPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_requests_payment_id_key" ON "manual_payment_requests"("payment_id");

-- CreateIndex
CREATE INDEX "manual_payment_requests_proforma_invoice_id_status_idx" ON "manual_payment_requests"("proforma_invoice_id", "status");

-- CreateIndex
CREATE INDEX "manual_payment_requests_company_id_status_idx" ON "manual_payment_requests"("company_id", "status");

-- AddForeignKey
ALTER TABLE "payment_entry_policies" ADD CONSTRAINT "payment_entry_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_entry_policies" ADD CONSTRAINT "payment_entry_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_requests" ADD CONSTRAINT "manual_payment_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
