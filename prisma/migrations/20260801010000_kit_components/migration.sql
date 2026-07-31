-- CreateTable
CREATE TABLE "kit_components" (
    "id" UUID NOT NULL,
    "kit_product_id" UUID NOT NULL,
    "component_product_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kit_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kit_components_kit_product_id_idx" ON "kit_components"("kit_product_id");

-- CreateIndex
CREATE INDEX "kit_components_component_product_id_idx" ON "kit_components"("component_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "kit_components_kit_product_id_component_product_id_key" ON "kit_components"("kit_product_id", "component_product_id");

-- AddForeignKey
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_kit_product_id_fkey" FOREIGN KEY ("kit_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_components" ADD CONSTRAINT "kit_components_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed Kit product category
INSERT INTO "product_categories" ("id", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Kit', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "product_categories" WHERE "name" = 'Kit'
);
