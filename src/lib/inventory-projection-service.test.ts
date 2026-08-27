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
        committedStock: 0,
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

    expect(projection[0]?.openingQuantity).toBe(150);
    expect(projection[0]?.projectedAvailableQuantity).toBe(180);
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
      inventoryLot: {
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
        committedStock: 0,
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

  it("projects only the remaining quantity for partially received lots", async () => {
    const client = {
      warehouse: {
        findFirst: vi.fn(async () => ({ id: "warehouse-1" })),
      },
      inventorySafetyStock: {
        findFirst: vi.fn(async () => ({ safetyQty: 20 })),
      },
      inventoryEvent: {
        findMany: vi.fn(async () => [
          {
            id: "incoming-1",
            eventType: InventoryEventType.PURCHASE_INCOMING,
            status: InventoryEventStatus.ACTIVE,
            quantity: 720,
            effectiveDate: new Date("2026-08-03T00:00:00.000Z"),
            expectedMinDate: new Date("2026-08-03T00:00:00.000Z"),
            expectedMaxDate: new Date("2026-08-03T00:00:00.000Z"),
            sourceType: "INVENTORY_LOT",
            sourceId: "lot-6",
            sourceNumber: "LOT-26-27-00006",
            replacesEventId: null,
          },
        ]),
      },
      inventoryLot: {
        findMany: vi.fn(async () => [
          {
            id: "lot-6",
            quantity: 720,
            receivedQuantity: 72,
            damagedQuantity: 0,
          },
        ]),
      },
    } as unknown as PrismaClient;

    const projection = await createInventoryProjectionService(
      client,
      async () => ({
        availableStock: 72,
        incomingStock: 648,
        bookedStock: 0,
        damagedStock: 0,
        committedStock: 0,
      }),
    ).projectInventory({
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      startDate: "2026-07-30",
      endDate: "2026-08-03",
    });

    expect(projection.map((day) => day.projectedAvailableQuantity)).toEqual([
      52, 52, 52, 52, 700,
    ]);
    expect(projection[4]?.incomingQuantity).toBe(648);
  });

  it("ignores booking reservations on fully dispatched PIs even if dispatch events under-count", async () => {
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
            id: "reserve-stale",
            eventType: InventoryEventType.BOOKING_RESERVATION,
            status: InventoryEventStatus.ACTIVE,
            quantity: 15,
            effectiveDate: new Date("2026-08-08T00:00:00.000Z"),
            expectedMinDate: new Date("2026-08-08T00:00:00.000Z"),
            expectedMaxDate: new Date("2026-08-10T00:00:00.000Z"),
            sourceType: "PROFORMA_INVOICE",
            sourceId: "pi-00093",
            sourceNumber: "PCMV-PI-26-27-00093",
            replacesEventId: null,
          },
          {
            id: "dispatch-partial",
            eventType: InventoryEventType.ACTUAL_DISPATCH,
            status: InventoryEventStatus.ACTIVE,
            quantity: 5,
            effectiveDate: new Date("2026-08-10T00:00:00.000Z"),
            expectedMinDate: null,
            expectedMaxDate: null,
            sourceType: "DISPATCH",
            sourceId: "dc-1",
            sourceNumber: "DC-1",
            replacesEventId: null,
          },
        ]),
      },
      inventoryLot: {
        findMany: vi.fn(async () => []),
      },
      dispatch: {
        findMany: vi.fn(async () => [
          { id: "dc-1", proformaInvoiceId: "pi-00093" },
        ]),
      },
      proformaInvoice: {
        findMany: vi.fn(async () => [
          {
            id: "pi-00093",
            status: "FULLY_DISPATCHED",
            items: [
              {
                productId: "product-610",
                qty: 15,
                dispatchedQty: 15,
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const projection = await createInventoryProjectionService(
      client,
      async () => ({
        availableStock: 47,
        incomingStock: 0,
        bookedStock: 0,
        damagedStock: 0,
        committedStock: 0,
      }),
    ).projectInventory({
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-610",
      startDate: "2026-08-21",
      endDate: "2026-08-21",
    });

    // Stale 15-unit reservation must not reduce projected availability.
    expect(projection[0]?.projectedAvailableQuantity).toBe(47);
    expect(client.proformaInvoice.findMany).toHaveBeenCalled();
  });

  it("keeps only undispached open PI quantity in projected availability", async () => {
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
            id: "reserve-partial",
            eventType: InventoryEventType.BOOKING_RESERVATION,
            status: InventoryEventStatus.ACTIVE,
            quantity: 40,
            effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
            expectedMinDate: new Date("2026-08-01T00:00:00.000Z"),
            expectedMaxDate: new Date("2026-08-05T00:00:00.000Z"),
            sourceType: "PROFORMA_INVOICE",
            sourceId: "pi-partial",
            sourceNumber: "PI-PARTIAL",
            replacesEventId: null,
          },
        ]),
      },
      inventoryLot: {
        findMany: vi.fn(async () => []),
      },
      dispatch: {
        findMany: vi.fn(async () => []),
      },
      proformaInvoice: {
        findMany: vi.fn(async () => [
          {
            id: "pi-partial",
            status: "PARTIALLY_DISPATCHED",
            items: [
              {
                productId: "product-1",
                qty: 40,
                dispatchedQty: 30,
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const projection = await createInventoryProjectionService(
      client,
      async () => ({
        availableStock: 100,
        incomingStock: 0,
        bookedStock: 0,
        damagedStock: 0,
        committedStock: 0,
      }),
    ).projectInventory({
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });

    // 100 physical − 10 remaining reserved = 90
    expect(projection[0]?.projectedAvailableQuantity).toBe(90);
  });
});
