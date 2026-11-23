-- CreateEnum
CREATE TYPE "MonthlyAuditResolution" AS ENUM ('FOUND', 'SOLD', 'WRITE_OFF', 'ADDED');

-- AlterEnum
ALTER TYPE "SerialStatus" ADD VALUE 'UNDER_INVESTIGATION';

-- AlterTable
ALTER TABLE "inventory_monthly_audit_findings" ADD COLUMN     "resolution" "MonthlyAuditResolution",
ADD COLUMN     "resolution_note" TEXT;

