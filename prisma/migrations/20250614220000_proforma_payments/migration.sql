-- CreateEnum
CREATE TYPE "ProformaInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PENDING_BOOKING', 'BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI', 'NEFT', 'RTGS');

-- CreateTable
CREATE TABLE "proforma_invoices" (
    "id" UUID NOT NULL,
    "pi_no" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sales_user_id" UUID NOT NULL,
    "quotation_id" UUID,
    "warehouse_id" UUID,
    "status" "ProformaInvoiceStatus" NOT NULL,
    "pi_date" DATE NOT NULL,
    "total_value" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "booked_at" TIMESTAMP(3),
    "booked_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice_items" (
    "id" UUID NOT NULL,
    "pi_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "proforma_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "proforma_invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "reference_no" TEXT,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_pi_no_key" ON "proforma_invoices"("pi_no");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_quotation_id_key" ON "proforma_invoices"("quotation_id");

-- CreateIndex
CREATE INDEX "proforma_invoices_company_id_status_idx" ON "proforma_invoices"("company_id", "status");

-- CreateIndex
CREATE INDEX "proforma_invoices_customer_id_idx" ON "proforma_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_pi_id_idx" ON "proforma_invoice_items"("pi_id");

-- CreateIndex
CREATE INDEX "payments_proforma_invoice_id_idx" ON "payments"("proforma_invoice_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");

-- CreateIndex
CREATE INDEX "payments_company_id_payment_date_idx" ON "payments"("company_id", "payment_date");

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_sales_user_id_fkey" FOREIGN KEY ("sales_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
