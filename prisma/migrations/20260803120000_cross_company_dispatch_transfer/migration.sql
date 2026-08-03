-- CreateEnum
CREATE TYPE "TransferOrigin" AS ENUM ('MANUAL', 'DISPATCH_SHORTFALL');

-- CreateEnum
CREATE TYPE "PiCrossCompanyTransferPlanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'CROSS_COMPANY_TRANSFER';

-- AlterTable
ALTER TABLE "inventory_transfers" ADD COLUMN "origin" "TransferOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "proforma_invoice_id" UUID,
ADD COLUMN "dispatch_id" UUID,
ADD COLUMN "approved_by" UUID;

-- CreateTable
CREATE TABLE "pi_cross_company_transfer_plans" (
    "id" UUID NOT NULL,
    "pi_id" UUID NOT NULL,
    "from_company_id" UUID NOT NULL,
    "to_company_id" UUID NOT NULL,
    "status" "PiCrossCompanyTransferPlanStatus" NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "inventory_transfer_id" UUID,
    "dispatch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pi_cross_company_transfer_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pi_cross_company_transfer_plan_lines" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "actual_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_purchase_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pi_cross_company_transfer_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pi_cross_company_transfer_plan_serials" (
    "id" UUID NOT NULL,
    "plan_line_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,
    "unit_purchase_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pi_cross_company_transfer_plan_serials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pi_cross_company_transfer_plans_inventory_transfer_id_key" ON "pi_cross_company_transfer_plans"("inventory_transfer_id");

-- CreateIndex
CREATE INDEX "pi_cross_company_transfer_plans_pi_id_status_idx" ON "pi_cross_company_transfer_plans"("pi_id", "status");

-- CreateIndex
CREATE INDEX "pi_cross_company_transfer_plans_status_created_at_idx" ON "pi_cross_company_transfer_plans"("status", "created_at");

-- CreateIndex
CREATE INDEX "pi_cross_company_transfer_plan_lines_plan_id_idx" ON "pi_cross_company_transfer_plan_lines"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "pi_cross_company_transfer_plan_serials_plan_line_id_serial_id_key" ON "pi_cross_company_transfer_plan_serials"("plan_line_id", "serial_id");

-- CreateIndex
CREATE INDEX "inventory_transfers_origin_created_at_idx" ON "inventory_transfers"("origin", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transfers_proforma_invoice_id_idx" ON "inventory_transfers"("proforma_invoice_id");

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "proforma_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_inventory_transfer_id_fkey" FOREIGN KEY ("inventory_transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plans" ADD CONSTRAINT "pi_cross_company_transfer_plans_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plan_lines" ADD CONSTRAINT "pi_cross_company_transfer_plan_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "pi_cross_company_transfer_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plan_lines" ADD CONSTRAINT "pi_cross_company_transfer_plan_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plan_serials" ADD CONSTRAINT "pi_cross_company_transfer_plan_serials_plan_line_id_fkey" FOREIGN KEY ("plan_line_id") REFERENCES "pi_cross_company_transfer_plan_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pi_cross_company_transfer_plan_serials" ADD CONSTRAINT "pi_cross_company_transfer_plan_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
