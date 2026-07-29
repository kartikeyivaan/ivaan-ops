import {
  InventoryEventStatus,
  InventoryEventType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  createEvent,
  createInventoryEventService,
} from "@/lib/inventory-event-service";

function mockClient() {
  const client = {
    $transaction: vi.fn(async (operation) => operation(client)),
    warehouse: {
      findFirst: vi.fn(async () => ({ id: "warehouse-1" })),
    },
    inventoryEvent: {
      create: vi.fn(async ({ data }) => ({ id: "event-1", ...data })),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }) => ({ id: "event-1", ...data })),
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({ id: "audit-1", ...data })),
    },
  };
  return client as unknown as PrismaClient;
}

describe("inventory event service", () => {
  it("creates an active event with a signed effect and audit record", async () => {
    const client = mockClient();

    await createEvent(client, {
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      eventType: InventoryEventType.BOOKING_RESERVATION,
      quantity: 5,
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      createdById: "user-1",
    });

    expect(client.inventoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: InventoryEventStatus.ACTIVE,
        quantityEffect: -5,
      }),
    });
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        recordId: "event-1",
      }),
    });
  });

  it("rejects a warehouse outside the company scope", async () => {
    const client = mockClient();
    vi.mocked(client.warehouse.findFirst).mockResolvedValue(null);

    await expect(
      createEvent(client, {
        companyId: "company-1",
        warehouseId: "other-company-warehouse",
        productId: "product-1",
        eventType: InventoryEventType.RETURN_IN,
        quantity: 1,
        effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
        createdById: "user-1",
      }),
    ).rejects.toThrow("WAREHOUSE_NOT_FOUND");
    expect(client.inventoryEvent.create).not.toHaveBeenCalled();
  });

  it("requires a cancellation reason before opening a transaction", async () => {
    const client = mockClient();
    const service = createInventoryEventService(client);

    await expect(
      service.cancelEvent("event-1", "  ", "user-1"),
    ).rejects.toThrow("CANCELLATION_REASON_REQUIRED");
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("creates one booking release linked to its reservation", async () => {
    const client = mockClient();
    vi.mocked(client.inventoryEvent.findUnique).mockResolvedValue({
      id: "reservation-1",
      companyId: "company-1",
      warehouseId: "warehouse-1",
      productId: "product-1",
      eventType: InventoryEventType.BOOKING_RESERVATION,
      quantity: new Prisma.Decimal(7),
      quantityEffect: -7,
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      expectedMinDate: null,
      expectedMaxDate: null,
      sourceType: "PROFORMA_INVOICE",
      sourceId: null,
      sourceNumber: "PI-1",
      replacesEventId: null,
      status: InventoryEventStatus.ACTIVE,
      notes: null,
      cancellationReason: null,
      cancelledAt: null,
      createdById: "user-1",
      updatedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(client.inventoryEvent.findFirst).mockResolvedValue(null);

    await createInventoryEventService(client).createReversingEvent(
      "reservation-1",
      "user-2",
    );

    expect(client.inventoryEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: InventoryEventType.BOOKING_RELEASE,
        quantityEffect: 7,
        replacesEventId: "reservation-1",
        createdById: "user-2",
      }),
    });
  });
});
