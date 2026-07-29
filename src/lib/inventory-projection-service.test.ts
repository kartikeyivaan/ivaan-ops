import {
  InventoryEventStatus,
  InventoryEventType,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createInventoryProjectionService } from "@/lib/inventory-projection-service";

describe("inventory projection service", () => {
  it("loads physical stock, default safety stock, and projection events", async () => {
    const client = {
      warehouse: {
        findFirst: vi.fn(async () => ({ id: "warehouse-1" })),
      },
      inventorySafetyStock: {
        findFirst: vi.fn(async () => null),
      },
      inventoryEvent: {
        findMany: vi.fn(async () => [
          {
            id: "incoming-1",
            eventType: InventoryEventType.PURCHASE_INCOMING,
            status: InventoryEventStatus.ACTIVE,
            quantity: 30,
            effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
            expectedMinDate: null,
            expectedMaxDate: null,
            sourceType: null,
            sourceId: null,
            sourceNumber: null,
            replacesEventId: null,
          },
        ]),
      },
    } as unknown as PrismaClient;
    const stockLoader = vi.fn(async () => ({
      availableStock: 150,
      incomingStock: 0,
      bookedStock: 0,
      damagedStock: 0,
    }));

    const projection = await createInventoryProjectionService(
      client,
      stockLoader,
    ).projectInventory({
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });

    expect(projection[0]?.openingQuantity).toBe(50);
    expect(projection[0]?.projectedAvailableQuantity).toBe(80);
    expect(stockLoader).toHaveBeenCalledWith(
      client,
      "company-1",
      "product-1",
      "warehouse-1",
    );
  });

  it("uses the latest applicable safety stock override", async () => {
    const client = {
      warehouse: {
        findFirst: vi.fn(async () => ({ id: "warehouse-1" })),
      },
      inventorySafetyStock: {
        findFirst: vi.fn(async () => ({ safetyQty: 25 })),
      },
      inventoryEvent: {
        findMany: vi.fn(async () => []),
      },
    } as unknown as PrismaClient;

    const projection = await createInventoryProjectionService(
      client,
      async () => ({
        availableStock: 100,
        incomingStock: 0,
        bookedStock: 0,
        damagedStock: 0,
      }),
    ).projectInventory({
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });

    expect(projection[0]?.projectedAvailableQuantity).toBe(75);
    expect(client.inventorySafetyStock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { effectiveFrom: "desc" },
      }),
    );
  });
});
