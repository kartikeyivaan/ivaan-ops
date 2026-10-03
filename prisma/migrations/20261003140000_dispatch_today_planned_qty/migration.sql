-- Planned dispatch quantity per PI line when Sales marks Dispatch Today (kit lines use kit units).
ALTER TABLE "proforma_invoice_items"
ADD COLUMN "dispatch_today_planned_qty" DECIMAL(12, 3);
