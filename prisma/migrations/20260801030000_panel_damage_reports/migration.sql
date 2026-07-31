-- AlterEnum
ALTER TYPE "SerialStatus" ADD VALUE 'DAMAGE_PENDING';

-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'PANEL_DAMAGE';

-- CreateEnum
CREATE TYPE "DamageReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DamageCategory" AS ENUM ('HANDLING', 'STORAGE', 'TRANSIT_AFTER_INWARD', 'OTHER');

-- CreateTable
CREATE TABLE "inventory_damage_reports" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "category" "DamageCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DamageReportStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_damage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_damage_reports_company_id_status_idx" ON "inventory_damage_reports"("company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_damage_reports_serial_id_status_idx" ON "inventory_damage_reports"("serial_id", "status");

-- CreateIndex
CREATE INDEX "inventory_damage_reports_warehouse_id_idx" ON "inventory_damage_reports"("warehouse_id");

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_damage_reports" ADD CONSTRAINT "inventory_damage_reports_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
