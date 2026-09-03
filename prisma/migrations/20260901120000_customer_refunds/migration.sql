-- Customer refunds module: refund requests, reusable customer payout accounts,
-- and references to existing bank transactions.
--
-- Strictly additive. No column or row on payments / bank_transactions /
-- bank_payment_allocations / proforma_invoices is altered, so PI balances,
-- payment allocation and reconciliation behaviour are unchanged.

-- CreateEnum
CREATE TYPE "CustomerRefundStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED', 'PROCESSING', 'REFUNDED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerRefundReason" AS ENUM ('ORDER_CANCELLED', 'EXCESS_PAYMENT', 'DUPLICATE_PAYMENT', 'PARTIAL_ORDER_CANCELLATION', 'PAYMENT_RECEIVED_IN_ERROR', 'OTHER');

-- AlterTable: firm refund bank-account memory (existing rows start at zero usage)
ALTER TABLE "bank_accounts" ADD COLUMN "refund_usage_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bank_accounts" ADD COLUMN "last_refund_used_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_refund_bank_accounts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_number_masked" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_refund_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_refunds" (
    "id" UUID NOT NULL,
    "refund_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "verification_code" TEXT NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "pi_number" TEXT,
    "received_amount" DECIMAL(14,2) NOT NULL,
    "requested_amount" DECIMAL(14,2) NOT NULL,
    "approved_amount" DECIMAL(14,2),
    "actual_refund_amount" DECIMAL(14,2),
    "reason" "CustomerRefundReason" NOT NULL,
    "remarks" TEXT,
    "status" "CustomerRefundStatus" NOT NULL DEFAULT 'DRAFT',
    "refund_bank_account_id" UUID,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approval_remarks" TEXT,
    "rejected_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "returned_for_correction_at" TIMESTAMP(3),
    "returned_for_correction_by" UUID,
    "returned_for_correction_reason" TEXT,
    "processed_by" UUID,
    "processed_at" TIMESTAMP(3),
    "refund_date" DATE,
    "refund_from_bank_account_id" UUID,
    "refund_payment_mode" "PaymentMode",
    "utr_number" TEXT,
    "processing_remarks" TEXT,
    "failure_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_refund_transaction_references" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_refund_transaction_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_refund_bank_accounts_customer_id_is_active_idx" ON "customer_refund_bank_accounts"("customer_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refund_bank_accounts_customer_id_account_number_if_key" ON "customer_refund_bank_accounts"("customer_id", "account_number", "ifsc_code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refunds_refund_number_key" ON "customer_refunds"("refund_number");

-- CreateIndex
CREATE INDEX "customer_refunds_company_id_status_idx" ON "customer_refunds"("company_id", "status");

-- CreateIndex
CREATE INDEX "customer_refunds_customer_id_status_idx" ON "customer_refunds"("customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_refunds_bank_transaction_id_status_idx" ON "customer_refunds"("bank_transaction_id", "status");

-- CreateIndex
CREATE INDEX "customer_refunds_requested_by_status_idx" ON "customer_refunds"("requested_by", "status");

-- CreateIndex
CREATE INDEX "customer_refunds_company_id_requested_at_idx" ON "customer_refunds"("company_id", "requested_at");

-- CreateIndex
CREATE INDEX "customer_refunds_status_idx" ON "customer_refunds"("status");

-- CreateIndex: one UTR may only settle one refund (NULLs are not compared, so drafts are unaffected)
CREATE UNIQUE INDEX "customer_refunds_utr_number_key" ON "customer_refunds"("utr_number");

-- CreateIndex
CREATE INDEX "customer_refund_transaction_references_bank_transaction_id_idx" ON "customer_refund_transaction_references"("bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refund_transaction_references_refund_id_bank_trans_key" ON "customer_refund_transaction_references"("refund_id", "bank_transaction_id");

-- AddForeignKey
ALTER TABLE "customer_refund_bank_accounts" ADD CONSTRAINT "customer_refund_bank_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refund_bank_accounts" ADD CONSTRAINT "customer_refund_bank_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_refund_bank_account_id_fkey" FOREIGN KEY ("refund_bank_account_id") REFERENCES "customer_refund_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_refund_from_bank_account_id_fkey" FOREIGN KEY ("refund_from_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_returned_for_correction_by_fkey" FOREIGN KEY ("returned_for_correction_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refund_transaction_references" ADD CONSTRAINT "customer_refund_transaction_references_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "customer_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refund_transaction_references" ADD CONSTRAINT "customer_refund_transaction_references_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
