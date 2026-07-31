-- CreateEnum
CREATE TYPE "InventoryEventType" AS ENUM ('OPENING_STOCK', 'MANUAL_ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT_OUT', 'PURCHASE_INCOMING', 'STOCK_TRANSFER_IN', 'STOCK_TRANSFER_OUT', 'BOOKING_RESERVATION', 'BOOKING_RELEASE', 'PLANNED_DISPATCH', 'ACTUAL_DISPATCH', 'RETURN_IN', 'RETURN_OUT');

-- CreateEnum
CREATE TYPE "InventoryEventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryTermMode" AS ENUM ('ADVANCE_BOOKING', 'READY_STOCK', 'SUBJECT_TO_AVAILABILITY', 'LEGACY');

-- CreateEnum
CREATE TYPE "QuotationWarningType" AS ENUM ('PCM_NON_MODULE', 'CROSS_COMPANY_STOCK');

-- CreateEnum
CREATE TYPE "InvoiceHandoverStatus" AS ENUM ('PENDING_INVOICE', 'INVOICE_RECORDED', 'CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "DocumentationStatus" AS ENUM ('PENDING', 'HOLD', 'FOR_REVIEW', 'DCR_ISSUED', 'NOT_REQUIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LotStatus" ADD VALUE 'DRAFT';
ALTER TYPE "LotStatus" ADD VALUE 'ORDERED';
ALTER TYPE "LotStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "LotStatus" ADD VALUE 'PARTIALLY_RECEIVED';
ALTER TYPE "LotStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "LotStatus" ADD VALUE 'DELAYED';
ALTER TYPE "LotStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "dispatch_cutoff_time" TEXT;

-- AlterTable
ALTER TABLE "dispatches" ADD COLUMN     "planned_dispatch_date" DATE,
ADD COLUMN     "receiver_mobile" TEXT,
ADD COLUMN     "receiver_name" TEXT,
ADD COLUMN     "signature_url" TEXT;

-- AlterTable
ALTER TABLE "inventory_lots" ADD COLUMN     "expected_max_date" DATE,
ADD COLUMN     "expected_min_date" DATE,
ADD COLUMN     "reference_number" TEXT,
ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN     "booking_allowed" BOOLEAN,
ADD COLUMN     "delivery_term_mode" "DeliveryTermMode",
ADD COLUMN     "delivery_term_note_snapshot" TEXT,
ADD COLUMN     "dispatch_max_days" INTEGER,
ADD COLUMN     "dispatch_min_days" INTEGER,
ADD COLUMN     "required_dispatch_max_date" DATE,
ADD COLUMN     "required_dispatch_min_date" DATE,
ADD COLUMN     "required_payment_percent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "booking_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_term_mode" "DeliveryTermMode" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "delivery_term_note_snapshot" TEXT,
ADD COLUMN     "dispatch_max_days" INTEGER,
ADD COLUMN     "dispatch_min_days" INTEGER,
ADD COLUMN     "required_payment_percent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "inventory_events" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "event_type" "InventoryEventType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantity_effect" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "expected_min_date" DATE,
    "expected_max_date" DATE,
    "source_type" TEXT,
    "source_id" UUID,
    "source_number" TEXT,
    "replaces_event_id" UUID,
    "status" "InventoryEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_safety_stock" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "safety_qty" DECIMAL(12,3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_safety_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_working_days" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_working" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "company_working_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_holidays" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_working_days" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_working" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouse_working_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_holidays" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_warning_logs" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warning_type" "QuotationWarningType" NOT NULL,
    "displayed" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB,
    "proceeded_by" UUID NOT NULL,
    "proceeded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_warning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_handovers" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "InvoiceHandoverStatus" NOT NULL DEFAULT 'PENDING_INVOICE',
    "invoice_number" TEXT,
    "invoice_date" DATE,
    "remarks" TEXT,
    "attachment_url" TEXT,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_records" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "invoice_handover_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "DocumentationStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to" UUID,
    "assigned_date" DATE,
    "completed_date" DATE,
    "completed_by" UUID,
    "remarks" TEXT,
    "internal_notes" TEXT,
    "hold_reason" TEXT,
    "review_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_status_history" (
    "id" UUID NOT NULL,
    "documentation_record_id" UUID NOT NULL,
    "from_status" "DocumentationStatus",
    "to_status" "DocumentationStatus" NOT NULL,
    "hold_reason" TEXT,
    "review_reason" TEXT,
    "remarks" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_assignment_history" (
    "id" UUID NOT NULL,
    "documentation_record_id" UUID NOT NULL,
    "from_user_id" UUID,
    "to_user_id" UUID,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "documentation_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_events_company_id_warehouse_id_product_id_effecti_idx" ON "inventory_events"("company_id", "warehouse_id", "product_id", "effective_date");

-- CreateIndex
CREATE INDEX "inventory_events_status_event_type_idx" ON "inventory_events"("status", "event_type");

-- CreateIndex
CREATE INDEX "inventory_events_source_type_source_id_idx" ON "inventory_events"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "inventory_events_replaces_event_id_idx" ON "inventory_events"("replaces_event_id");

-- CreateIndex
CREATE INDEX "inventory_safety_stock_company_id_warehouse_id_product_id_i_idx" ON "inventory_safety_stock"("company_id", "warehouse_id", "product_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_safety_stock_company_id_warehouse_id_product_id_e_key" ON "inventory_safety_stock"("company_id", "warehouse_id", "product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "company_working_days_company_id_weekday_key" ON "company_working_days"("company_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "company_holidays_company_id_holiday_date_key" ON "company_holidays"("company_id", "holiday_date");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_working_days_warehouse_id_weekday_key" ON "warehouse_working_days"("warehouse_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_holidays_warehouse_id_holiday_date_key" ON "warehouse_holidays"("warehouse_id", "holiday_date");

-- CreateIndex
CREATE INDEX "quotation_warning_logs_quotation_id_idx" ON "quotation_warning_logs"("quotation_id");

-- CreateIndex
CREATE INDEX "quotation_warning_logs_company_id_warning_type_idx" ON "quotation_warning_logs"("company_id", "warning_type");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_handovers_dispatch_id_key" ON "invoice_handovers"("dispatch_id");

-- CreateIndex
CREATE INDEX "invoice_handovers_company_id_status_idx" ON "invoice_handovers"("company_id", "status");

-- CreateIndex
CREATE INDEX "invoice_handovers_customer_id_idx" ON "invoice_handovers"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentation_records_dispatch_id_key" ON "documentation_records"("dispatch_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentation_records_invoice_handover_id_key" ON "documentation_records"("invoice_handover_id");

-- CreateIndex
CREATE INDEX "documentation_records_company_id_status_idx" ON "documentation_records"("company_id", "status");

-- CreateIndex
CREATE INDEX "documentation_records_assigned_to_status_idx" ON "documentation_records"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "documentation_records_customer_id_idx" ON "documentation_records"("customer_id");

-- CreateIndex
CREATE INDEX "documentation_status_history_documentation_record_id_change_idx" ON "documentation_status_history"("documentation_record_id", "changed_at");

-- CreateIndex
CREATE INDEX "documentation_assignment_history_documentation_record_id_ch_idx" ON "documentation_assignment_history"("documentation_record_id", "changed_at");

-- CreateIndex
CREATE INDEX "inventory_lots_expected_max_date_idx" ON "inventory_lots"("expected_max_date");

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_replaces_event_id_fkey" FOREIGN KEY ("replaces_event_id") REFERENCES "inventory_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_safety_stock" ADD CONSTRAINT "inventory_safety_stock_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_safety_stock" ADD CONSTRAINT "inventory_safety_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_safety_stock" ADD CONSTRAINT "inventory_safety_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_safety_stock" ADD CONSTRAINT "inventory_safety_stock_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_safety_stock" ADD CONSTRAINT "inventory_safety_stock_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_working_days" ADD CONSTRAINT "company_working_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_working_days" ADD CONSTRAINT "warehouse_working_days_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_holidays" ADD CONSTRAINT "warehouse_holidays_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_warning_logs" ADD CONSTRAINT "quotation_warning_logs_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_warning_logs" ADD CONSTRAINT "quotation_warning_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_warning_logs" ADD CONSTRAINT "quotation_warning_logs_proceeded_by_fkey" FOREIGN KEY ("proceeded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_handovers" ADD CONSTRAINT "invoice_handovers_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_handovers" ADD CONSTRAINT "invoice_handovers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_handovers" ADD CONSTRAINT "invoice_handovers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_handovers" ADD CONSTRAINT "invoice_handovers_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_invoice_handover_id_fkey" FOREIGN KEY ("invoice_handover_id") REFERENCES "invoice_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_records" ADD CONSTRAINT "documentation_records_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_status_history" ADD CONSTRAINT "documentation_status_history_documentation_record_id_fkey" FOREIGN KEY ("documentation_record_id") REFERENCES "documentation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_status_history" ADD CONSTRAINT "documentation_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_assignment_history" ADD CONSTRAINT "documentation_assignment_history_documentation_record_id_fkey" FOREIGN KEY ("documentation_record_id") REFERENCES "documentation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentation_assignment_history" ADD CONSTRAINT "documentation_assignment_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
