-- CreateEnum
CREATE TYPE "PdfDocumentType" AS ENUM ('PROFORMA_INVOICE', 'QUOTATION', 'DISPATCH', 'PROJECT_DISPATCH', 'PROJECT_PROPOSAL');

-- CreateEnum
CREATE TYPE "DispatchLineCostSource" AS ENUM ('SERIAL_LOT', 'LANDING_COST', 'MIXED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "stored_pdfs" (
    "id" UUID NOT NULL,
    "document_type" "PdfDocumentType" NOT NULL,
    "document_id" UUID NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "content_version" TEXT NOT NULL,
    "pdf_data" BYTEA NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_pdfs_document_type_document_id_variant_key" ON "stored_pdfs"("document_type", "document_id", "variant");

-- CreateIndex
CREATE INDEX "stored_pdfs_document_type_document_id_idx" ON "stored_pdfs"("document_type", "document_id");

-- AlterTable
ALTER TABLE "dispatch_lines" ADD COLUMN "revenue_ex_gst" DECIMAL(14,2),
ADD COLUMN "cogs_ex_gst" DECIMAL(14,2),
ADD COLUMN "profit_ex_gst" DECIMAL(14,2),
ADD COLUMN "margin_percent" DECIMAL(8,4),
ADD COLUMN "cost_source" "DispatchLineCostSource",
ADD COLUMN "profit_snapshotted_at" TIMESTAMP(3);
