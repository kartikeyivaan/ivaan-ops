-- AlterTable
ALTER TABLE "companies" ADD COLUMN "signature_image_data" TEXT,
ADD COLUMN "stamp_image_data" TEXT,
ADD COLUMN "default_signatory_name" TEXT,
ADD COLUMN "default_signatory_designation" TEXT,
ADD COLUMN "print_content_top_offset_mm" INTEGER NOT NULL DEFAULT 65;

UPDATE "companies"
SET
  "default_signatory_name" = 'Harshal Patil',
  "default_signatory_designation" = 'Partner',
  "print_content_top_offset_mm" = 65
WHERE "code" = 'ISE';

UPDATE "companies"
SET
  "default_signatory_name" = 'Kartikey Mahajan',
  "default_signatory_designation" = 'Partner',
  "print_content_top_offset_mm" = 60
WHERE "code" = 'PCMV';

-- CreateTable
CREATE TABLE "official_letters" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "letter_serial_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "letter_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "signatory_name" TEXT NOT NULL,
    "signatory_designation" TEXT NOT NULL,
    "signature_image_data" TEXT,
    "stamp_image_data" TEXT,
    "stamp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "print_signature_enabled" BOOLEAN NOT NULL DEFAULT true,
    "print_content_top_offset_mm" INTEGER NOT NULL,
    "generated_pdf_data" BYTEA,
    "generated_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_letters_letter_serial_number_key" ON "official_letters"("letter_serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "official_letters_company_id_financial_year_sequence_number_key" ON "official_letters"("company_id", "financial_year", "sequence_number");

-- CreateIndex
CREATE INDEX "official_letters_company_id_letter_date_idx" ON "official_letters"("company_id", "letter_date");

-- CreateIndex
CREATE INDEX "official_letters_created_at_idx" ON "official_letters"("created_at");

-- AddForeignKey
ALTER TABLE "official_letters" ADD CONSTRAINT "official_letters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "official_letters" ADD CONSTRAINT "official_letters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
