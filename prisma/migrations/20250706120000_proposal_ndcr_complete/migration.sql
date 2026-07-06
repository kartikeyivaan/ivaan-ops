-- AlterTable
ALTER TABLE "project_proposal_revisions"
ADD COLUMN "module_product_id" UUID,
ADD COLUMN "module_qty" INTEGER,
ADD COLUMN "inverter_capacity_kw" DECIMAL(6, 2);

-- AddForeignKey
ALTER TABLE "project_proposal_revisions"
ADD CONSTRAINT "project_proposal_revisions_module_product_id_fkey"
FOREIGN KEY ("module_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
