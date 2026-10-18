-- CreateEnum
CREATE TYPE "ProposalPackageType" AS ENUM ('SUBSIDY_DCR', 'NON_SUBSIDY_FIXED', 'NON_SUBSIDY_CUSTOM', 'HYBRID');

-- AlterTable
ALTER TABLE "proposal_package_master"
ADD COLUMN "package_type" "ProposalPackageType" NOT NULL DEFAULT 'SUBSIDY_DCR',
ADD COLUMN "dcr_additional_panel_rate" DECIMAL(14,2),
ADD COLUMN "ndcr_additional_panel_rate" DECIMAL(14,2),
ADD COLUMN "future_structure_panel_rate" DECIMAL(14,2),
ADD COLUMN "module_segment_label" TEXT,
ADD COLUMN "hybrid_base_price" DECIMAL(14,2),
ADD COLUMN "hybrid_per_inverter_kw_rate" DECIMAL(14,2),
ADD COLUMN "hybrid_per_battery_unit_rate" DECIMAL(14,2),
ADD COLUMN "battery_unit_kwh" DECIMAL(6,2);

UPDATE "proposal_package_master"
SET "package_type" = 'NON_SUBSIDY_CUSTOM'
WHERE "code" = 'NDCR_COMPLETE';

-- AlterTable
ALTER TABLE "project_proposal_revisions"
ADD COLUMN "battery_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "proposal_package_module_options" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_package_module_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_package_module_options_package_id_idx" ON "proposal_package_module_options"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_package_module_options_package_id_product_id_key" ON "proposal_package_module_options"("package_id", "product_id");

-- AddForeignKey
ALTER TABLE "proposal_package_module_options" ADD CONSTRAINT "proposal_package_module_options_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "proposal_package_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_package_module_options" ADD CONSTRAINT "proposal_package_module_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
