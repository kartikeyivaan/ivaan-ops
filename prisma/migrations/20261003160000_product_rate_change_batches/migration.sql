-- CreateEnum
CREATE TYPE "ProductRateChangeBatchStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "product_rate_change_batches" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "status" "ProductRateChangeBatchStatus" NOT NULL,
    "created_by" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejected_by" UUID,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_rate_change_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rate_change_lines" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "previous_standard_price" DECIMAL(12,2) NOT NULL,
    "previous_minimum_price" DECIMAL(12,2) NOT NULL,
    "new_standard_price" DECIMAL(12,2) NOT NULL,
    "new_minimum_price" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_rate_change_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rate_change_sign_offs" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_rate_change_sign_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_rate_change_batches_request_number_key" ON "product_rate_change_batches"("request_number");

-- CreateIndex
CREATE INDEX "product_rate_change_batches_status_submitted_at_idx" ON "product_rate_change_batches"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "product_rate_change_batches_created_by_idx" ON "product_rate_change_batches"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "product_rate_change_lines_batch_id_product_id_key" ON "product_rate_change_lines"("batch_id", "product_id");

-- CreateIndex
CREATE INDEX "product_rate_change_lines_batch_id_idx" ON "product_rate_change_lines"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_rate_change_sign_offs_batch_id_user_id_key" ON "product_rate_change_sign_offs"("batch_id", "user_id");

-- CreateIndex
CREATE INDEX "product_rate_change_sign_offs_batch_id_idx" ON "product_rate_change_sign_offs"("batch_id");

-- AddForeignKey
ALTER TABLE "product_rate_change_batches" ADD CONSTRAINT "product_rate_change_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_change_batches" ADD CONSTRAINT "product_rate_change_batches_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_change_lines" ADD CONSTRAINT "product_rate_change_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_rate_change_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_change_lines" ADD CONSTRAINT "product_rate_change_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_change_sign_offs" ADD CONSTRAINT "product_rate_change_sign_offs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_rate_change_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rate_change_sign_offs" ADD CONSTRAINT "product_rate_change_sign_offs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
