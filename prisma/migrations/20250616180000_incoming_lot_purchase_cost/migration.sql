ALTER TABLE "inventory_lots" ADD COLUMN "unit_purchase_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_lots" ADD COLUMN "transport_charges" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_lots" ADD COLUMN "commission_charges" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_lots" ADD COLUMN "total_purchase_cost" DECIMAL(14,2) NOT NULL DEFAULT 0;
