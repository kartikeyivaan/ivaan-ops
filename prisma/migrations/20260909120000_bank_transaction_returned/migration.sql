-- Allow credit receipts that have been fully refunded to be marked RETURNED
-- so they no longer appear as refundable customer payments.

ALTER TYPE "BankTransactionAssignmentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
