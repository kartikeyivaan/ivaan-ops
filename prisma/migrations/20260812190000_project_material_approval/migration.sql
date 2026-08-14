-- AlterEnum
ALTER TYPE "ApprovalModuleType" ADD VALUE 'PROJECT_MATERIAL';

-- AlterTable
ALTER TABLE "project_material_lines" ADD COLUMN "stock_source_log" JSONB;

-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN "project_id" UUID;

-- AlterTable
ALTER TABLE "purchase_request_lines" ADD COLUMN "project_id" UUID;
ALTER TABLE "purchase_request_lines" ADD COLUMN "project_material_line_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_lines_project_material_line_id_key" ON "purchase_request_lines"("project_material_line_id");

-- CreateIndex
CREATE INDEX "purchase_request_lines_project_id_idx" ON "purchase_request_lines"("project_id");

-- CreateIndex
CREATE INDEX "purchase_requests_project_id_idx" ON "purchase_requests"("project_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_project_material_line_id_fkey" FOREIGN KEY ("project_material_line_id") REFERENCES "project_material_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
