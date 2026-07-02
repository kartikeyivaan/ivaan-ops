-- Add company profile fields so document details are DB-driven instead of hardcoded.
ALTER TABLE "companies" ADD COLUMN "address" TEXT;
ALTER TABLE "companies" ADD COLUMN "city" TEXT;
ALTER TABLE "companies" ADD COLUMN "state" TEXT;
ALTER TABLE "companies" ADD COLUMN "pincode" TEXT;
ALTER TABLE "companies" ADD COLUMN "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN "email" TEXT;
ALTER TABLE "companies" ADD COLUMN "gst_number" TEXT;
ALTER TABLE "companies" ADD COLUMN "tagline" TEXT;
