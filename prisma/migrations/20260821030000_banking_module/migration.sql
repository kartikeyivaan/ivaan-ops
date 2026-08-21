-- Banking module: bank accounts, statement imports, transactions, issues,
-- payment allocations, and non-breaking Payment verification extensions.

-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('MANUAL_UNVERIFIED', 'BANK_VERIFIED');

-- CreateEnum
CREATE TYPE "BankStatementParserType" AS ENUM ('SBI', 'HDFC', 'ICICI', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BankStatementImportStatus" AS ENUM ('PENDING', 'PREVIEWED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankTransactionAssignmentStatus" AS ENUM ('UNASSIGNED', 'PARTIALLY_ASSIGNED', 'FULLY_ASSIGNED', 'MANUAL_REVIEW', 'NON_CUSTOMER_PAYMENT');

-- CreateEnum
CREATE TYPE "BankTransactionIssueType" AS ENUM ('EXISTING_DATA_MISMATCH', 'BALANCE_CONTINUITY_MISMATCH', 'POSSIBLE_MISSING_TRANSACTION', 'SEQUENCE_GAP', 'PARSER_ERROR', 'ACCOUNT_MAPPING_ERROR');

-- CreateEnum
CREATE TYPE "BankTransactionIssueStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "BankPaymentAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- AlterTable: audit reason for banking lifecycle events
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;

-- AlterTable: payments — verification + optional bank link (historical rows stay MANUAL_UNVERIFIED)
ALTER TABLE "payments" ADD COLUMN "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'MANUAL_UNVERIFIED';
ALTER TABLE "payments" ADD COLUMN "bank_transaction_id" UUID;
ALTER TABLE "payments" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "payments" SET "updated_at" = "created_at";

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_number_masked" TEXT NOT NULL,
    "ifsc_code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "received_in_account" "ReceivedInAccount" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID,
    "original_filename" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "parser_type" "BankStatementParserType" NOT NULL,
    "statement_start_date" DATE,
    "statement_end_date" DATE,
    "transactions_detected" INTEGER NOT NULL DEFAULT 0,
    "new_transactions" INTEGER NOT NULL DEFAULT 0,
    "duplicates_detected" INTEGER NOT NULL DEFAULT 0,
    "mismatches_detected" INTEGER NOT NULL DEFAULT 0,
    "balance_issues_detected" INTEGER NOT NULL DEFAULT 0,
    "processing_status" "BankStatementImportStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_deleted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "source_import_id" UUID,
    "transaction_date" DATE NOT NULL,
    "value_date" DATE,
    "description" TEXT NOT NULL,
    "reference_number" TEXT,
    "debit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "running_balance" DECIMAL(14,2) NOT NULL,
    "statement_sequence" INTEGER NOT NULL,
    "source_row_number" INTEGER,
    "transaction_fingerprint" TEXT NOT NULL,
    "payment_code" TEXT,
    "assignment_status" "BankTransactionAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_issues" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID,
    "bank_transaction_id" UUID,
    "source_import_id" UUID,
    "issue_type" "BankTransactionIssueType" NOT NULL,
    "status" "BankTransactionIssueStatus" NOT NULL DEFAULT 'OPEN',
    "existing_values" JSONB,
    "uploaded_values" JSONB,
    "details" JSONB,
    "resolution_reason" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "ignored_by" UUID,
    "ignored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transaction_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_payment_allocations" (
    "id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "pi_payment_id" UUID NOT NULL,
    "pi_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_company_name" TEXT NOT NULL,
    "customer_gst_number" TEXT NOT NULL,
    "allocated_amount" DECIMAL(14,2) NOT NULL,
    "allocation_status" "BankPaymentAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "bank_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_account_number_key" ON "bank_accounts"("account_number");

-- CreateIndex
CREATE INDEX "bank_accounts_company_id_is_active_idx" ON "bank_accounts"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "bank_accounts_company_id_received_in_account_idx" ON "bank_accounts"("company_id", "received_in_account");

-- CreateIndex
CREATE INDEX "bank_statement_imports_bank_account_id_uploaded_at_idx" ON "bank_statement_imports"("bank_account_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "bank_statement_imports_file_hash_idx" ON "bank_statement_imports"("file_hash");

-- CreateIndex
CREATE INDEX "bank_statement_imports_processing_status_idx" ON "bank_statement_imports"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_payment_code_key" ON "bank_transactions"("payment_code");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_transaction_date_idx" ON "bank_transactions"("bank_account_id", "transaction_date");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_reference_number_idx" ON "bank_transactions"("bank_account_id", "reference_number");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_assignment_status_idx" ON "bank_transactions"("bank_account_id", "assignment_status");

-- CreateIndex
CREATE INDEX "bank_transactions_source_import_id_idx" ON "bank_transactions"("source_import_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bank_account_id_transaction_fingerprint_key" ON "bank_transactions"("bank_account_id", "transaction_fingerprint");

-- CreateIndex
CREATE INDEX "bank_transaction_issues_status_issue_type_idx" ON "bank_transaction_issues"("status", "issue_type");

-- CreateIndex
CREATE INDEX "bank_transaction_issues_bank_account_id_status_idx" ON "bank_transaction_issues"("bank_account_id", "status");

-- CreateIndex
CREATE INDEX "bank_transaction_issues_source_import_id_idx" ON "bank_transaction_issues"("source_import_id");

-- CreateIndex
CREATE INDEX "bank_transaction_issues_bank_transaction_id_idx" ON "bank_transaction_issues"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "bank_payment_allocations_bank_transaction_id_allocation_status_idx" ON "bank_payment_allocations"("bank_transaction_id", "allocation_status");

-- CreateIndex
CREATE INDEX "bank_payment_allocations_pi_payment_id_idx" ON "bank_payment_allocations"("pi_payment_id");

-- CreateIndex
CREATE INDEX "bank_payment_allocations_pi_id_allocation_status_idx" ON "bank_payment_allocations"("pi_id", "allocation_status");

-- CreateIndex
CREATE INDEX "bank_payment_allocations_customer_id_idx" ON "bank_payment_allocations"("customer_id");

-- CreateIndex
CREATE INDEX "payments_bank_transaction_id_idx" ON "payments"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "payments_verification_status_idx" ON "payments"("verification_status");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "bank_statement_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_issues" ADD CONSTRAINT "bank_transaction_issues_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_issues" ADD CONSTRAINT "bank_transaction_issues_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_issues" ADD CONSTRAINT "bank_transaction_issues_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "bank_statement_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_issues" ADD CONSTRAINT "bank_transaction_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_issues" ADD CONSTRAINT "bank_transaction_issues_ignored_by_fkey" FOREIGN KEY ("ignored_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_allocations" ADD CONSTRAINT "bank_payment_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_allocations" ADD CONSTRAINT "bank_payment_allocations_pi_payment_id_fkey" FOREIGN KEY ("pi_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_allocations" ADD CONSTRAINT "bank_payment_allocations_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_allocations" ADD CONSTRAINT "bank_payment_allocations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_payment_allocations" ADD CONSTRAINT "bank_payment_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (payments → bank_transactions; created after bank_transactions exists)
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
