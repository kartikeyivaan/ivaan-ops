import {
  InventoryEventStatus,
  InventoryEventType,
  type PrismaClient,
} from "@prisma/client";

import { createEvent } from "@/lib/inventory-event-service";
import { getWarehouseStockForProduct } from "@/lib/inventory-service";

export const OPENING_STOCK_BACKFILL_SOURCE = "OPENING_STOCK_BACKFILL";

export type OpeningStockBackfillOptions = {
  userId: string;
  dryRun?: boolean;
  companyId?: string;
  effectiveDate?: Date;
};

export type OpeningStockBackfillSummary = {
  combinationsScanned: number;
  eventsCreated: number;
  existingEventsSkipped: number;
  zeroStockSkipped: number;
  dryRunCandidates: number;
};

export async function backfillOpeningStock(
  client: PrismaClient,
  options: OpeningStockBackfillOptions,
): Promise<OpeningStockBackfillSummary> {
  if (!options.userId) throw new Error("BACKFILL_USER_ID_REQUIRED");

  const effectiveDate = new Date(
    (options.effectiveDate ?? new Date()).getTime(),
  );
  effectiveDate.setUTCHours(0, 0, 0, 0);

  const [warehouses, products] = await Promise.all([
    client.warehouse.findMany({
      where: {
        isActive: true,
        ...(options.companyId ? { companyId: options.companyId } : {}),
      },
      select: { id: true, companyId: true },
      orderBy: { id: "asc" },
    }),
    client.product.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const summary: OpeningStockBackfillSummary = {
    combinationsScanned: 0,
    eventsCreated: 0,
    existingEventsSkipped: 0,
    zeroStockSkipped: 0,
    dryRunCandidates: 0,
  };

  for (const warehouse of warehouses) {
    for (const product of products) {
      summary.combinationsScanned += 1;

      const existing = await client.inventoryEvent.findFirst({
        where: {
          companyId: warehouse.companyId,
          warehouseId: warehouse.id,
          productId: product.id,
          eventType: InventoryEventType.OPENING_STOCK,
          sourceType: OPENING_STOCK_BACKFILL_SOURCE,
          status: { not: InventoryEventStatus.CANCELLED },
        },
        select: { id: true },
      });
      if (existing) {
        summary.existingEventsSkipped += 1;
        continue;
      }

      const stock = await getWarehouseStockForProduct(
        client,
        warehouse.companyId,
        product.id,
        warehouse.id,
      );
      if (stock.availableStock <= 0) {
        summary.zeroStockSkipped += 1;
        continue;
      }

      if (options.dryRun) {
        summary.dryRunCandidates += 1;
        continue;
      }

      const created = await client.$transaction(async (tx) => {
        const duplicate = await tx.inventoryEvent.findFirst({
          where: {
            companyId: warehouse.companyId,
            warehouseId: warehouse.id,
            productId: product.id,
            eventType: InventoryEventType.OPENING_STOCK,
            sourceType: OPENING_STOCK_BACKFILL_SOURCE,
            status: { not: InventoryEventStatus.CANCELLED },
          },
          select: { id: true },
        });
        if (duplicate) return false;

        await createEvent(tx, {
          companyId: warehouse.companyId,
          warehouseId: warehouse.id,
          productId: product.id,
          eventType: InventoryEventType.OPENING_STOCK,
          quantity: stock.availableStock,
          effectiveDate,
          sourceType: OPENING_STOCK_BACKFILL_SOURCE,
          sourceNumber: `OPENING-${warehouse.id}-${product.id}`,
          notes: "Opening stock generated from current warehouse stock.",
          createdById: options.userId,
        });
        return true;
      });

      if (created) summary.eventsCreated += 1;
      else summary.existingEventsSkipped += 1;
    }
  }

  return summary;
}
