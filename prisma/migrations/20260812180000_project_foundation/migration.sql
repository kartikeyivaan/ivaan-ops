-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('OPEN', 'MATERIAL_DRAFT', 'MATERIAL_PENDING_APPROVAL', 'MATERIAL_ASSIGNED', 'READY_FOR_DISPATCH', 'PARTIALLY_DISPATCHED', 'FULLY_DISPATCHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectMaterialLineSource" AS ENUM ('PROPOSAL', 'ADDED');

-- CreateEnum
CREATE TYPE "ProjectMaterialLineStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PENDING_STOCK', 'ASSIGNED', 'PARTIALLY_DISPATCHED', 'FULLY_DISPATCHED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "project_no" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_mobile" TEXT NOT NULL,
    "site_address" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_material_assignments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_material_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_material_lines" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "source" "ProjectMaterialLineSource" NOT NULL,
    "required_qty" DECIMAL(12,3) NOT NULL,
    "assigned_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "dispatched_qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "line_status" "ProjectMaterialLineStatus" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "last_approved_qty" DECIMAL(12,3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_material_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_no_key" ON "projects"("project_no");

-- CreateIndex
CREATE UNIQUE INDEX "projects_proposal_id_key" ON "projects"("proposal_id");

-- CreateIndex
CREATE INDEX "projects_company_id_status_idx" ON "projects"("company_id", "status");

-- CreateIndex
CREATE INDEX "projects_customer_name_idx" ON "projects"("customer_name");

-- CreateIndex
CREATE INDEX "projects_project_no_idx" ON "projects"("project_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_material_assignments_project_id_key" ON "project_material_assignments"("project_id");

-- CreateIndex
CREATE INDEX "project_material_lines_assignment_id_idx" ON "project_material_lines"("assignment_id");

-- CreateIndex
CREATE INDEX "project_material_lines_product_id_idx" ON "project_material_lines"("product_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_material_assignments" ADD CONSTRAINT "project_material_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_material_assignments" ADD CONSTRAINT "project_material_assignments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_material_lines" ADD CONSTRAINT "project_material_lines_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "project_material_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_material_lines" ADD CONSTRAINT "project_material_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
