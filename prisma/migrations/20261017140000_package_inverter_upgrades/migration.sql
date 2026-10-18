-- AlterTable
ALTER TABLE "proposal_inverter_upgrade_master" ADD COLUMN "package_id" UUID;

-- CreateIndex
CREATE INDEX "proposal_inverter_upgrade_master_package_id_idx" ON "proposal_inverter_upgrade_master"("package_id");

-- AddForeignKey
ALTER TABLE "proposal_inverter_upgrade_master" ADD CONSTRAINT "proposal_inverter_upgrade_master_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "proposal_package_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
