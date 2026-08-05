-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'INCOMING_LOT_EDIT';

-- CreateEnum
CREATE TYPE "IncomingLotChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "incoming_lot_change_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "previous_product_id" UUID NOT NULL,
    "previous_quantity" DECIMAL(12,3) NOT NULL,
    "previous_purchase_invoice_no" TEXT NOT NULL,
    "proposed_product_id" UUID NOT NULL,
    "proposed_quantity" DECIMAL(12,3) NOT NULL,
    "proposed_purchase_invoice_no" TEXT NOT NULL,
    "status" "IncomingLotChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_lot_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incoming_lot_change_requests_company_id_status_idx" ON "incoming_lot_change_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "incoming_lot_change_requests_lot_id_status_idx" ON "incoming_lot_change_requests"("lot_id", "status");

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_previous_product_id_fkey" FOREIGN KEY ("previous_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_proposed_product_id_fkey" FOREIGN KEY ("proposed_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_lot_change_requests" ADD CONSTRAINT "incoming_lot_change_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
