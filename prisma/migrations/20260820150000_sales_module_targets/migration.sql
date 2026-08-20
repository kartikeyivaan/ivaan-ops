-- CreateEnum
CREATE TYPE "SalesModuleTargetScope" AS ENUM ('COMPANY_DEFAULT', 'EXECUTIVE_DEFAULT', 'MONTHLY_OVERRIDE');

-- CreateTable
CREATE TABLE "sales_module_targets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "scope" "SalesModuleTargetScope" NOT NULL,
    "executive_id" UUID,
    "year" INTEGER,
    "month" INTEGER,
    "target_modules" INTEGER NOT NULL DEFAULT 3000,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_module_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_module_targets_company_id_idx" ON "sales_module_targets"("company_id");

-- CreateIndex
CREATE INDEX "sales_module_targets_executive_id_idx" ON "sales_module_targets"("executive_id");

-- Partial unique indexes (NULLs are not distinct in a plain UNIQUE across scopes)
CREATE UNIQUE INDEX "sales_module_targets_company_default_key"
  ON "sales_module_targets"("company_id")
  WHERE "scope" = 'COMPANY_DEFAULT';

CREATE UNIQUE INDEX "sales_module_targets_executive_default_key"
  ON "sales_module_targets"("company_id", "executive_id")
  WHERE "scope" = 'EXECUTIVE_DEFAULT';

CREATE UNIQUE INDEX "sales_module_targets_monthly_override_key"
  ON "sales_module_targets"("company_id", "executive_id", "year", "month")
  WHERE "scope" = 'MONTHLY_OVERRIDE';

-- AddForeignKey
ALTER TABLE "sales_module_targets" ADD CONSTRAINT "sales_module_targets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_module_targets" ADD CONSTRAINT "sales_module_targets_executive_id_fkey" FOREIGN KEY ("executive_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_module_targets" ADD CONSTRAINT "sales_module_targets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_module_targets" ADD CONSTRAINT "sales_module_targets_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
