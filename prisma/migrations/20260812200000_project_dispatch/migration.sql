-- CreateEnum
CREATE TYPE "ProjectDispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'CANCEL_PENDING', 'CANCELLED');

-- CreateTable
CREATE TABLE "project_dispatches" (
    "id" UUID NOT NULL,
    "dispatch_no" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "ProjectDispatchStatus" NOT NULL,
    "vehicle_no" TEXT,
    "receiver_name" TEXT,
    "receiver_mobile" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "signature_data" TEXT,
    "remarks" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_dispatch_lines" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "material_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "kit_product_id" UUID,
    "kit_product_name" TEXT,
    "kit_bom_qty" DECIMAL(12,3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_dispatch_line_serials" (
    "id" UUID NOT NULL,
    "dispatch_line_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,

    CONSTRAINT "project_dispatch_line_serials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_dispatches_dispatch_no_key" ON "project_dispatches"("dispatch_no");

-- CreateIndex
CREATE INDEX "project_dispatches_project_id_idx" ON "project_dispatches"("project_id");

-- CreateIndex
CREATE INDEX "project_dispatches_company_id_status_idx" ON "project_dispatches"("company_id", "status");

-- CreateIndex
CREATE INDEX "project_dispatch_lines_dispatch_id_idx" ON "project_dispatch_lines"("dispatch_id");

-- CreateIndex
CREATE INDEX "project_dispatch_lines_material_line_id_idx" ON "project_dispatch_lines"("material_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_dispatch_line_serials_dispatch_line_id_serial_id_key" ON "project_dispatch_line_serials"("dispatch_line_id", "serial_id");

-- AddForeignKey
ALTER TABLE "project_dispatches" ADD CONSTRAINT "project_dispatches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatches" ADD CONSTRAINT "project_dispatches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatches" ADD CONSTRAINT "project_dispatches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatches" ADD CONSTRAINT "project_dispatches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatch_lines" ADD CONSTRAINT "project_dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "project_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatch_lines" ADD CONSTRAINT "project_dispatch_lines_material_line_id_fkey" FOREIGN KEY ("material_line_id") REFERENCES "project_material_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatch_lines" ADD CONSTRAINT "project_dispatch_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatch_line_serials" ADD CONSTRAINT "project_dispatch_line_serials_dispatch_line_id_fkey" FOREIGN KEY ("dispatch_line_id") REFERENCES "project_dispatch_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dispatch_line_serials" ADD CONSTRAINT "project_dispatch_line_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "inventory_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
