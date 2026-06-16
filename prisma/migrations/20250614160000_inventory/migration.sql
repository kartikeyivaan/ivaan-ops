-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('INCOMING', 'CLOSED');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'DAMAGED', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('INWARD', 'BOOK', 'DISPATCH', 'DAMAGE', 'TRANSFER', 'ADJUST');

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "gst" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "lot_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "vendor_id" UUID,
    "purchase_invoice_no" TEXT,
    "purchase_date" DATE NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "received_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "damaged_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "status" "LotStatus" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_serials" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL,
    "current_warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "transaction_type" "InventoryTransactionType" NOT NULL,
    "company_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID,
    "qty" DECIMAL(12,3) NOT NULL,
    "from_warehouse_id" UUID,
    "to_warehouse_id" UUID,
    "reference_type" TEXT,
    "reference_id" UUID,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_vendor_name_idx" ON "vendors"("vendor_name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_lot_number_key" ON "inventory_lots"("lot_number");

-- CreateIndex
CREATE INDEX "inventory_lots_company_id_status_idx" ON "inventory_lots"("company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_lots_warehouse_id_idx" ON "inventory_lots"("warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_lots_product_id_idx" ON "inventory_lots"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_serials_serial_number_key" ON "inventory_serials"("serial_number");

-- CreateIndex
CREATE INDEX "inventory_serials_product_id_status_idx" ON "inventory_serials"("product_id", "status");

-- CreateIndex
CREATE INDEX "inventory_serials_current_warehouse_id_idx" ON "inventory_serials"("current_warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_company_id_created_at_idx" ON "inventory_transactions"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_product_id_idx" ON "inventory_transactions"("product_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_lot_id_idx" ON "inventory_transactions"("lot_id");

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_current_warehouse_id_fkey" FOREIGN KEY ("current_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
