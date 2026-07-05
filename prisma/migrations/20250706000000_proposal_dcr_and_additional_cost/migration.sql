-- AlterTable
ALTER TABLE "project_proposal_revisions"
ADD COLUMN "dcr_additional_panels" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dcr_panel_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "additional_cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
