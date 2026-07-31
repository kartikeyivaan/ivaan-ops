-- CreateEnum
CREATE TYPE "ReceivedInAccount" AS ENUM ('SBI', 'ICICI', 'HDFC');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "received_in_account" "ReceivedInAccount";
