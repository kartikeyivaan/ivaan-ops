-- CreateTable
CREATE TABLE "proposal_inverter_brand_master" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand_upgrade_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_coming_soon" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_inverter_brand_master_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_inverter_brand_master_code_key" ON "proposal_inverter_brand_master"("code");

-- Seed inverter brand master (PRD v1.1)
INSERT INTO "proposal_inverter_brand_master" (
    "id", "code", "name", "brand_upgrade_amount", "is_active", "is_coming_soon", "sort_order", "updated_at"
) VALUES
    (gen_random_uuid(), 'POLYCAB', 'Polycab', 0.00, true, false, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'DEYE', 'Deye', 0.00, true, false, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'WAAREE', 'Waaree', 5000.00, true, false, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'SOLAREDGE', 'SolarEdge', 5000.00, true, false, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'PURE_HYBRID', 'Pure Hybrid', 0.00, false, true, 5, CURRENT_TIMESTAMP);
