-- CreateEnum
CREATE TYPE "ProjectProposalStatus" AS ENUM ('DRAFT', 'SENT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProjectProposalApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProposalConnectionPhase" AS ENUM ('SINGLE_PHASE', 'THREE_PHASE');

-- CreateEnum
CREATE TYPE "ProposalStructureType" AS ENUM ('CUSTOM_FABRICATED', 'PREFAB_C_CHANNEL', 'MONO_RAIL');

-- CreateEnum
CREATE TYPE "ProposalBuildingType" AS ENUM ('APARTMENT', 'BUNGALOW');

-- CreateTable
CREATE TABLE "proposal_package_master" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "panel_wp" INTEGER NOT NULL,
    "panel_count" INTEGER NOT NULL,
    "system_kw" DECIMAL(6,2) NOT NULL,
    "default_inverter_brands" JSONB NOT NULL,
    "base_price" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_coming_soon" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_package_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_inverter_upgrade_master" (
    "id" UUID NOT NULL,
    "package_panel_count" INTEGER NOT NULL,
    "upgrade_kw" DECIMAL(6,2) NOT NULL,
    "label" TEXT NOT NULL,
    "upgrade_amount" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_inverter_upgrade_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_proposals" (
    "id" UUID NOT NULL,
    "proposal_no" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "sales_user_id" UUID NOT NULL,
    "status" "ProjectProposalStatus" NOT NULL,
    "current_revision_no" INTEGER NOT NULL DEFAULT 0,
    "converted_at" TIMESTAMP(3),
    "converted_by" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_proposal_revisions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_mobile" TEXT NOT NULL,
    "short_address" TEXT NOT NULL,
    "proposal_date" DATE NOT NULL,
    "validity_date" DATE NOT NULL,
    "package_id" UUID NOT NULL,
    "connection_phase" "ProposalConnectionPhase" NOT NULL,
    "inverter_brands" JSONB NOT NULL,
    "inverter_upgrade_id" UUID,
    "structure_type" "ProposalStructureType" NOT NULL,
    "building_type" "ProposalBuildingType" NOT NULL,
    "extra_floors" INTEGER NOT NULL DEFAULT 0,
    "ndcr_additional_panels" INTEGER NOT NULL DEFAULT 0,
    "future_structure_panels" INTEGER NOT NULL DEFAULT 0,
    "base_package_amount" DECIMAL(14,2) NOT NULL,
    "brand_upgrade_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "inverter_upgrade_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "three_phase_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "structure_adjustment_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extra_floor_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "future_structure_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ndcr_panel_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subsidy_estimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(14,2) NOT NULL,
    "effective_customer_investment" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_proposal_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_proposal_status_history" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "revision_id" UUID,
    "from_status" "ProjectProposalStatus",
    "to_status" "ProjectProposalStatus" NOT NULL,
    "changed_by" UUID NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_proposal_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_proposal_approvals" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "status" "ProjectProposalApprovalStatus" NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_proposal_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_package_master_code_key" ON "proposal_package_master"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_inverter_upgrade_master_package_panel_count_upgrade_kw_key" ON "proposal_inverter_upgrade_master"("package_panel_count", "upgrade_kw");

-- CreateIndex
CREATE UNIQUE INDEX "project_proposals_proposal_no_key" ON "project_proposals"("proposal_no");

-- CreateIndex
CREATE INDEX "project_proposals_company_id_status_idx" ON "project_proposals"("company_id", "status");

-- CreateIndex
CREATE INDEX "project_proposals_sales_user_id_idx" ON "project_proposals"("sales_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_proposal_revisions_proposal_id_revision_no_key" ON "project_proposal_revisions"("proposal_id", "revision_no");

-- CreateIndex
CREATE INDEX "project_proposal_revisions_proposal_id_idx" ON "project_proposal_revisions"("proposal_id");

-- CreateIndex
CREATE INDEX "project_proposal_revisions_package_id_idx" ON "project_proposal_revisions"("package_id");

-- CreateIndex
CREATE INDEX "project_proposal_revisions_customer_mobile_idx" ON "project_proposal_revisions"("customer_mobile");

-- CreateIndex
CREATE INDEX "project_proposal_revisions_customer_name_idx" ON "project_proposal_revisions"("customer_name");

-- CreateIndex
CREATE INDEX "project_proposal_status_history_proposal_id_created_at_idx" ON "project_proposal_status_history"("proposal_id", "created_at");

-- CreateIndex
CREATE INDEX "project_proposal_status_history_revision_id_idx" ON "project_proposal_status_history"("revision_id");

-- CreateIndex
CREATE INDEX "project_proposal_approvals_proposal_id_status_idx" ON "project_proposal_approvals"("proposal_id", "status");

-- CreateIndex
CREATE INDEX "project_proposal_approvals_revision_id_idx" ON "project_proposal_approvals"("revision_id");

-- AddForeignKey
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_sales_user_id_fkey" FOREIGN KEY ("sales_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_converted_by_fkey" FOREIGN KEY ("converted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_revisions" ADD CONSTRAINT "project_proposal_revisions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_revisions" ADD CONSTRAINT "project_proposal_revisions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "proposal_package_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_revisions" ADD CONSTRAINT "project_proposal_revisions_inverter_upgrade_id_fkey" FOREIGN KEY ("inverter_upgrade_id") REFERENCES "proposal_inverter_upgrade_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_revisions" ADD CONSTRAINT "project_proposal_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_revisions" ADD CONSTRAINT "project_proposal_revisions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_status_history" ADD CONSTRAINT "project_proposal_status_history_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_status_history" ADD CONSTRAINT "project_proposal_status_history_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "project_proposal_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_status_history" ADD CONSTRAINT "project_proposal_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_approvals" ADD CONSTRAINT "project_proposal_approvals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_approvals" ADD CONSTRAINT "project_proposal_approvals_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "project_proposal_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_approvals" ADD CONSTRAINT "project_proposal_approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_proposal_approvals" ADD CONSTRAINT "project_proposal_approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed package master (PRD v1.1)
INSERT INTO "proposal_package_master" (
    "id", "code", "name", "description", "panel_wp", "panel_count", "system_kw",
    "default_inverter_brands", "base_price", "is_active", "is_coming_soon", "sort_order", "updated_at"
) VALUES
    (gen_random_uuid(), 'P1', 'P1 — 3.3kW (530+Wp × 6)', '530+Wp × 6 Panels, 3.3kW Polycab/Deye', 530, 6, 3.30, '["Polycab","Deye"]', 185000.00, true, false, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'P2', 'P2 — 3.3kW (570+Wp × 6)', '570+Wp × 6 Panels, 3.3kW Polycab/Deye', 570, 6, 3.30, '["Polycab","Deye"]', 195000.00, true, false, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'P3', 'P3 — 5kW (530+Wp × 9)', '530+Wp × 9 Panels, 5kW Polycab/Deye', 530, 9, 5.00, '["Polycab","Deye"]', 250000.00, true, false, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'P4', 'P4 — 5kW (570+Wp × 9)', '570+Wp × 9 Panels, 5kW Polycab/Deye', 570, 9, 5.00, '["Polycab","Deye"]', 270000.00, true, false, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'P610', '610+Wp Package', '610+Wp Package — Coming Soon', 610, 6, 3.30, '["Polycab","Deye"]', 0.00, false, true, 5, CURRENT_TIMESTAMP);

-- Seed inverter upgrade master (PRD v1.1)
INSERT INTO "proposal_inverter_upgrade_master" (
    "id", "package_panel_count", "upgrade_kw", "label", "upgrade_amount", "is_active", "sort_order", "updated_at"
) VALUES
    (gen_random_uuid(), 6, 4.00, '4kW Inverter Upgrade', 13500.00, true, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 6, 5.00, '5kW Inverter Upgrade', 15000.00, true, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 6, 6.00, '6kW Inverter Upgrade', 17000.00, true, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 9, 6.00, '6kW Inverter Upgrade', 2000.00, true, 4, CURRENT_TIMESTAMP);
