-- Interchange group per product. Same-group PI product swaps skip approval.
ALTER TABLE "products" ADD COLUMN "group_category" TEXT;
