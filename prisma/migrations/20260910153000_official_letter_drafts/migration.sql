-- CreateEnum
CREATE TYPE "OfficialLetterStatus" AS ENUM ('DRAFT', 'ISSUED');

-- AlterTable
ALTER TABLE "official_letters" ADD COLUMN "status" "OfficialLetterStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "official_letters"
SET "status" = 'ISSUED'
WHERE "generated_pdf_data" IS NOT NULL OR "letter_serial_number" IS NOT NULL;

ALTER TABLE "official_letters" ALTER COLUMN "letter_serial_number" DROP NOT NULL;
ALTER TABLE "official_letters" ALTER COLUMN "sequence_number" DROP NOT NULL;
