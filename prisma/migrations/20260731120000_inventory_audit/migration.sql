-- CreateEnum
CREATE TYPE "InventoryOpeningPhase" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OpeningAuditStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "OpeningLineCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "DailyAuditStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "companies"
ADD COLUMN "inventory_opening_phase" "InventoryOpeningPhase" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "inventory_tracking_start_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_opening_audits" (
    "id" UUID NOT NULL,
    "audit_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "OpeningAuditStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_opening_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_opening_audit_lines" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "condition" "OpeningLineCondition" NOT NULL DEFAULT 'GOOD',
    "physical_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_opening_audit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_opening_audit_serials" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_opening_audit_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_daily_audits" (
    "id" UUID NOT NULL,
    "audit_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "audit_date" DATE NOT NULL,
    "status" "DailyAuditStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_daily_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_daily_audit_lines" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "system_qty" DECIMAL(12,3) NOT NULL,
    "physical_qty" DECIMAL(12,3),
    "variance_qty" DECIMAL(12,3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_daily_audit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_opening_audits_audit_number_key" ON "inventory_opening_audits"("audit_number");

-- CreateIndex
CREATE INDEX "inventory_opening_audits_company_id_status_idx" ON "inventory_opening_audits"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_opening_audits_company_id_warehouse_id_key" ON "inventory_opening_audits"("company_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_opening_audit_lines_audit_id_idx" ON "inventory_opening_audit_lines"("audit_id");

-- CreateIndex
CREATE INDEX "inventory_opening_audit_lines_product_id_idx" ON "inventory_opening_audit_lines"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_opening_audit_lines_audit_id_product_id_condition_key" ON "inventory_opening_audit_lines"("audit_id", "product_id", "condition");

-- CreateIndex
CREATE INDEX "inventory_opening_audit_serials_serial_number_idx" ON "inventory_opening_audit_serials"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_opening_audit_serials_line_id_serial_number_key" ON "inventory_opening_audit_serials"("line_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_daily_audits_audit_number_key" ON "inventory_daily_audits"("audit_number");

-- CreateIndex
CREATE INDEX "inventory_daily_audits_company_id_warehouse_id_audit_date_idx" ON "inventory_daily_audits"("company_id", "warehouse_id", "audit_date");

-- CreateIndex
CREATE INDEX "inventory_daily_audits_company_id_status_idx" ON "inventory_daily_audits"("company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_daily_audit_lines_audit_id_idx" ON "inventory_daily_audit_lines"("audit_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_daily_audit_lines_audit_id_product_id_key" ON "inventory_daily_audit_lines"("audit_id", "product_id");

-- AddForeignKey
ALTER TABLE "inventory_opening_audits" ADD CONSTRAINT "inventory_opening_audits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audits" ADD CONSTRAINT "inventory_opening_audits_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audits" ADD CONSTRAINT "inventory_opening_audits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audits" ADD CONSTRAINT "inventory_opening_audits_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audits" ADD CONSTRAINT "inventory_opening_audits_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audit_lines" ADD CONSTRAINT "inventory_opening_audit_lines_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_opening_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audit_lines" ADD CONSTRAINT "inventory_opening_audit_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_opening_audit_serials" ADD CONSTRAINT "inventory_opening_audit_serials_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "inventory_opening_audit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audits" ADD CONSTRAINT "inventory_daily_audits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audits" ADD CONSTRAINT "inventory_daily_audits_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audits" ADD CONSTRAINT "inventory_daily_audits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audits" ADD CONSTRAINT "inventory_daily_audits_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audit_lines" ADD CONSTRAINT "inventory_daily_audit_lines_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_daily_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_daily_audit_lines" ADD CONSTRAINT "inventory_daily_audit_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
