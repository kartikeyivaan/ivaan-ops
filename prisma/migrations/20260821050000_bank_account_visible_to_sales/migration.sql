-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "visible_to_sales" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "bank_accounts_company_id_visible_to_sales_idx" ON "bank_accounts"("company_id", "visible_to_sales");
