-- AlterEnum
ALTER TYPE "SerialStatus" ADD VALUE 'REMOVED';

-- CreateEnum
CREATE TYPE "ManualStockEntryAction" AS ENUM ('IN', 'OUT', 'CHANGE_CONDITION');

-- CreateEnum
CREATE TYPE "ManualStockReason" AS ENUM (
  'FOUND_STOCK',
  'WRITE_OFF',
  'CORRECTION',
  'SAMPLE_DEMO',
  'INTER_BRANCH_PAPER',
  'CUSTOMER_RETURN_NO_SALES_DOC',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "ManualStockCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateTable
CREATE TABLE "manual_stock_entries" (
    "id" UUID NOT NULL,
    "entry_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "action" "ManualStockEntryAction" NOT NULL,
    "reason" "ManualStockReason" NOT NULL,
    "notes" TEXT,
    "condition" "ManualStockCondition",
    "quantity" DECIMAL(12,3) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_stock_entry_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "serial_id" UUID,
    "serial_number" TEXT,
    "from_status" "SerialStatus",
    "to_status" "SerialStatus",

    CONSTRAINT "manual_stock_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_stock_entries_entry_number_key" ON "manual_stock_entries"("entry_number");

-- CreateIndex
CREATE INDEX "manual_stock_entries_company_id_created_at_idx" ON "manual_stock_entries"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "manual_stock_entries_product_id_idx" ON "manual_stock_entries"("product_id");

-- CreateIndex
CREATE INDEX "manual_stock_entries_warehouse_id_idx" ON "manual_stock_entries"("warehouse_id");

-- CreateIndex
CREATE INDEX "manual_stock_entry_lines_entry_id_idx" ON "manual_stock_entry_lines"("entry_id");

-- CreateIndex
CREATE INDEX "manual_stock_entry_lines_serial_id_idx" ON "manual_stock_entry_lines"("serial_id");

-- AddForeignKey
ALTER TABLE "manual_stock_entries" ADD CONSTRAINT "manual_stock_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stock_entries" ADD CONSTRAINT "manual_stock_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stock_entries" ADD CONSTRAINT "manual_stock_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stock_entries" ADD CONSTRAINT "manual_stock_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stock_entry_lines" ADD CONSTRAINT "manual_stock_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "manual_stock_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stock_entry_lines" ADD CONSTRAINT "manual_stock_entry_lines_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
