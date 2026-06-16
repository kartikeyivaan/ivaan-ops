-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" UUID NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "from_company_id" UUID NOT NULL,
    "to_company_id" UUID NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "dispatched_by" UUID,
    "dispatched_at" TIMESTAMP(3),
    "received_by" UUID,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "received_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_line_serials" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,

    CONSTRAINT "inventory_transfer_line_serials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_transfer_number_key" ON "inventory_transfers"("transfer_number");

-- CreateIndex
CREATE INDEX "inventory_transfers_from_company_id_status_idx" ON "inventory_transfers"("from_company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_transfers_to_company_id_status_idx" ON "inventory_transfers"("to_company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_transfer_lines_transfer_id_idx" ON "inventory_transfer_lines"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfer_line_serials_line_id_serial_id_key" ON "inventory_transfer_line_serials"("line_id", "serial_id");

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_line_serials" ADD CONSTRAINT "inventory_transfer_line_serials_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "inventory_transfer_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_line_serials" ADD CONSTRAINT "inventory_transfer_line_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
