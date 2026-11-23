-- CreateEnum
CREATE TYPE "MonthlyAuditStatus" AS ENUM ('OPEN', 'CLOSED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MonthlyAuditScanSource" AS ENUM ('CAMERA', 'SCANNER', 'PASTE');

-- CreateEnum
CREATE TYPE "MonthlyAuditScanResult" AS ENUM ('FOUND', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "MonthlyAuditFindingType" AS ENUM ('MISSING', 'ADDITIONAL');

-- CreateTable
CREATE TABLE "inventory_monthly_audits" (
    "id" UUID NOT NULL,
    "audit_number" TEXT NOT NULL,
    "status" "MonthlyAuditStatus" NOT NULL DEFAULT 'OPEN',
    "started_by" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_monthly_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_monthly_audit_snapshots" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "snapshot_status" "SerialStatus" NOT NULL,

    CONSTRAINT "inventory_monthly_audit_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_monthly_audit_scans" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "matched_serial_id" UUID,
    "result" "MonthlyAuditScanResult" NOT NULL,
    "source" "MonthlyAuditScanSource" NOT NULL,
    "scanned_by" UUID NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_monthly_audit_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_monthly_audit_findings" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "type" "MonthlyAuditFindingType" NOT NULL,
    "serial_id" UUID,
    "serial_number" TEXT NOT NULL,
    "product_id" UUID,
    "investigation_note" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_monthly_audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_monthly_audit_qty_lines" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "record_qty" DECIMAL(12,3) NOT NULL,
    "audit_qty" DECIMAL(12,3),
    "variance_qty" DECIMAL(12,3),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_monthly_audit_qty_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_monthly_audits_audit_number_key" ON "inventory_monthly_audits"("audit_number");

-- CreateIndex
CREATE INDEX "inventory_monthly_audits_status_idx" ON "inventory_monthly_audits"("status");

-- CreateIndex
CREATE INDEX "inventory_monthly_audit_snapshots_audit_id_serial_number_idx" ON "inventory_monthly_audit_snapshots"("audit_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_monthly_audit_snapshots_audit_id_serial_id_key" ON "inventory_monthly_audit_snapshots"("audit_id", "serial_id");

-- CreateIndex
CREATE INDEX "inventory_monthly_audit_scans_audit_id_result_idx" ON "inventory_monthly_audit_scans"("audit_id", "result");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_monthly_audit_scans_audit_id_serial_number_key" ON "inventory_monthly_audit_scans"("audit_id", "serial_number");

-- CreateIndex
CREATE INDEX "inventory_monthly_audit_findings_audit_id_type_idx" ON "inventory_monthly_audit_findings"("audit_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_monthly_audit_qty_lines_audit_id_product_id_compa_key" ON "inventory_monthly_audit_qty_lines"("audit_id", "product_id", "company_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "inventory_monthly_audits" ADD CONSTRAINT "inventory_monthly_audits_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audits" ADD CONSTRAINT "inventory_monthly_audits_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audits" ADD CONSTRAINT "inventory_monthly_audits_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audits" ADD CONSTRAINT "inventory_monthly_audits_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_snapshots" ADD CONSTRAINT "inventory_monthly_audit_snapshots_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_monthly_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_snapshots" ADD CONSTRAINT "inventory_monthly_audit_snapshots_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_snapshots" ADD CONSTRAINT "inventory_monthly_audit_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_snapshots" ADD CONSTRAINT "inventory_monthly_audit_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_snapshots" ADD CONSTRAINT "inventory_monthly_audit_snapshots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_scans" ADD CONSTRAINT "inventory_monthly_audit_scans_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_monthly_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_scans" ADD CONSTRAINT "inventory_monthly_audit_scans_matched_serial_id_fkey" FOREIGN KEY ("matched_serial_id") REFERENCES "inventory_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_scans" ADD CONSTRAINT "inventory_monthly_audit_scans_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_findings" ADD CONSTRAINT "inventory_monthly_audit_findings_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_monthly_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_findings" ADD CONSTRAINT "inventory_monthly_audit_findings_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_findings" ADD CONSTRAINT "inventory_monthly_audit_findings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_findings" ADD CONSTRAINT "inventory_monthly_audit_findings_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_qty_lines" ADD CONSTRAINT "inventory_monthly_audit_qty_lines_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_monthly_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_qty_lines" ADD CONSTRAINT "inventory_monthly_audit_qty_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_qty_lines" ADD CONSTRAINT "inventory_monthly_audit_qty_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_audit_qty_lines" ADD CONSTRAINT "inventory_monthly_audit_qty_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

