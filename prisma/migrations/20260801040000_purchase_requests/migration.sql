-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ORDERED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "PurchaseRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "remarks" TEXT,
    "status_remarks" TEXT,
    "requested_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_lines" (
    "id" UUID NOT NULL,
    "purchase_request_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "requested_qty" DECIMAL(12,3) NOT NULL,
    "fulfilled_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "target_date" DATE,
    "priority" "PurchaseRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "remarks" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "inventory_lots" ADD COLUMN "purchase_request_line_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_request_number_key" ON "purchase_requests"("request_number");

-- CreateIndex
CREATE INDEX "purchase_requests_company_id_status_idx" ON "purchase_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_requested_by_idx" ON "purchase_requests"("requested_by");

-- CreateIndex
CREATE INDEX "purchase_requests_warehouse_id_idx" ON "purchase_requests"("warehouse_id");

-- CreateIndex
CREATE INDEX "purchase_request_lines_purchase_request_id_idx" ON "purchase_request_lines"("purchase_request_id");

-- CreateIndex
CREATE INDEX "purchase_request_lines_product_id_idx" ON "purchase_request_lines"("product_id");

-- CreateIndex
CREATE INDEX "inventory_lots_purchase_request_line_id_idx" ON "inventory_lots"("purchase_request_line_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_purchase_request_line_id_fkey" FOREIGN KEY ("purchase_request_line_id") REFERENCES "purchase_request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
