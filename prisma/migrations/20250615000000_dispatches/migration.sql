-- AlterEnum
ALTER TYPE "ProformaInvoiceStatus" ADD VALUE 'PARTIALLY_DISPATCHED';
ALTER TYPE "ProformaInvoiceStatus" ADD VALUE 'FULLY_DISPATCHED';

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'CANCEL_PENDING', 'CANCELLED');

-- AlterTable
ALTER TABLE "proforma_invoice_items" ADD COLUMN "dispatched_qty" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "proforma_invoice_serials" (
    "id" UUID NOT NULL,
    "pi_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,

    CONSTRAINT "proforma_invoice_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "dc_no" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "proforma_invoice_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "DispatchStatus" NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "vehicle_no" TEXT,
    "driver_name" TEXT,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "dispatched_by" UUID,
    "dispatched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_lines" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "proforma_invoice_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_line_serials" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,

    CONSTRAINT "dispatch_line_serials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoice_serials_pi_id_serial_id_key" ON "proforma_invoice_serials"("pi_id", "serial_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_dc_no_key" ON "dispatches"("dc_no");

-- CreateIndex
CREATE INDEX "dispatches_company_id_status_idx" ON "dispatches"("company_id", "status");

-- CreateIndex
CREATE INDEX "dispatches_customer_id_idx" ON "dispatches"("customer_id");

-- CreateIndex
CREATE INDEX "dispatches_proforma_invoice_id_idx" ON "dispatches"("proforma_invoice_id");

-- CreateIndex
CREATE INDEX "dispatch_lines_dispatch_id_idx" ON "dispatch_lines"("dispatch_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_line_serials_line_id_serial_id_key" ON "dispatch_line_serials"("line_id", "serial_id");

-- AddForeignKey
ALTER TABLE "proforma_invoice_serials" ADD CONSTRAINT "proforma_invoice_serials_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_serials" ADD CONSTRAINT "proforma_invoice_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_proforma_invoice_item_id_fkey" FOREIGN KEY ("proforma_invoice_item_id") REFERENCES "proforma_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_line_serials" ADD CONSTRAINT "dispatch_line_serials_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "dispatch_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_line_serials" ADD CONSTRAINT "dispatch_line_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
