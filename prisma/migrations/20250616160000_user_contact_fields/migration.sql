ALTER TABLE "users" ADD COLUMN "official_contact_number" TEXT;
ALTER TABLE "users" ADD COLUMN "personal_contact_number" TEXT;
ALTER TABLE "users" ADD COLUMN "digital_visiting_card_url" TEXT;

UPDATE "users"
SET "official_contact_number" = "mobile"
WHERE "mobile" IS NOT NULL AND "official_contact_number" IS NULL;
