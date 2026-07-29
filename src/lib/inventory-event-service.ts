import {
  InventoryEventStatus,
  InventoryEventType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { writeAuditLogTx } from "@/lib/audit";
import { toSignedInventoryQuantity } from "@/lib/inventory-events";
import { prisma } from "@/lib/prisma";

export type InventoryEventClient = PrismaClient | Prisma.TransactionClient;

export type CreateInventoryEventInput = {
  companyId: string;
  warehouseId: string;
  productId: string;
  eventType: InventoryEventType;
  quantity: number;
  effectiveDate: Date;
  expectedMinDate?: Date | null;
  expectedMaxDate?: Date | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceNumber?: string | null;
  replacesEventId?: string | null;
  status?: InventoryEventStatus;
  notes?: string | null;
  createdById: string;
};

export type ListInventoryEventsInput = {
  companyId: string;
  warehouseId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  statuses?: InventoryEventStatus[];
};

function isPrismaClient(
  client: InventoryEventClient,
): client is PrismaClient {
  return "$transaction" in client;
}

async function inTransaction<T>(
  client: InventoryEventClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (isPrismaClient(client)) {
    return client.$transaction(operation);
  }
  return operation(client);
}

export async function assertCompanyWarehouseScopeWithClient(
  client: InventoryEventClient,
  companyId: string,
  warehouseId: string,
) {
  const warehouse = await client.warehouse.findFirst({
    where: { id: warehouseId, companyId },
    select: { id: true },
  });
  if (!warehouse) {
    throw new Error("WAREHOUSE_NOT_FOUND");
  }
  return warehouse;
}

export async function assertCompanyWarehouseScope(
  companyId: string,
  warehouseId: string,
) {
  return assertCompanyWarehouseScopeWithClient(prisma, companyId, warehouseId);
}

export async function createEvent(
  client: InventoryEventClient,
  input: CreateInventoryEventInput,
) {
  const quantityEffect = toSignedInventoryQuantity(
    input.eventType,
    input.quantity,
  );

  return inTransaction(client, async (tx) => {
    await assertCompanyWarehouseScopeWithClient(
      tx,
      input.companyId,
      input.warehouseId,
    );

    const event = await tx.inventoryEvent.create({
      data: {
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        eventType: input.eventType,
        quantity: input.quantity,
        quantityEffect,
        effectiveDate: input.effectiveDate,
        expectedMinDate: input.expectedMinDate ?? null,
        expectedMaxDate: input.expectedMaxDate ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        sourceNumber: input.sourceNumber ?? null,
        replacesEventId: input.replacesEventId ?? null,
        status: input.status ?? InventoryEventStatus.ACTIVE,
        notes: input.notes ?? null,
        createdById: input.createdById,
      },
    });

    await writeAuditLogTx(tx, {
      tableName: "inventory_events",
      recordId: event.id,
      action: "CREATE",
      performedBy: input.createdById,
      companyId: input.companyId,
      reference: input.sourceNumber ?? null,
      newValue: {
        eventType: input.eventType,
        status: input.status ?? InventoryEventStatus.ACTIVE,
        quantity: input.quantity,
        quantityEffect,
        effectiveDate: input.effectiveDate.toISOString(),
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    });

    return event;
  });
}

export function createInventoryEventService(client: PrismaClient = prisma) {
  return {
    async cancelEvent(id: string, reason: string, userId: string) {
      const cancellationReason = reason.trim();
      if (!cancellationReason) {
        throw new Error("CANCELLATION_REASON_REQUIRED");
      }

      return client.$transaction(async (tx) => {
        const current = await tx.inventoryEvent.findUnique({ where: { id } });
        if (!current) throw new Error("INVENTORY_EVENT_NOT_FOUND");
        if (current.status === InventoryEventStatus.CANCELLED) {
          throw new Error("INVENTORY_EVENT_ALREADY_CANCELLED");
        }

        const cancelledAt = new Date();
        const event = await tx.inventoryEvent.update({
          where: { id },
          data: {
            status: InventoryEventStatus.CANCELLED,
            cancelledAt,
            cancellationReason,
            updatedById: userId,
          },
        });

        await writeAuditLogTx(tx, {
          tableName: "inventory_events",
          recordId: id,
          action: "CANCEL",
          performedBy: userId,
          companyId: current.companyId,
          reference: current.sourceNumber,
          oldValue: { status: current.status },
          newValue: {
            status: InventoryEventStatus.CANCELLED,
            cancellationReason,
            cancelledAt: cancelledAt.toISOString(),
          },
        });
        return event;
      });
    },

    async completeEvent(id: string, userId: string) {
      return client.$transaction(async (tx) => {
        const current = await tx.inventoryEvent.findUnique({ where: { id } });
        if (!current) throw new Error("INVENTORY_EVENT_NOT_FOUND");
        if (current.status === InventoryEventStatus.CANCELLED) {
          throw new Error("CANCELLED_EVENT_CANNOT_BE_COMPLETED");
        }

        const event = await tx.inventoryEvent.update({
          where: { id },
          data: {
            status: InventoryEventStatus.COMPLETED,
            updatedById: userId,
          },
        });
        await writeAuditLogTx(tx, {
          tableName: "inventory_events",
          recordId: id,
          action: "UPDATE",
          performedBy: userId,
          companyId: current.companyId,
          reference: current.sourceNumber,
          oldValue: { status: current.status },
          newValue: { status: InventoryEventStatus.COMPLETED },
        });
        return event;
      });
    },

    async createReversingEvent(originalEventId: string, userId: string) {
      return client.$transaction(async (tx) => {
        const original = await tx.inventoryEvent.findUnique({
          where: { id: originalEventId },
        });
        if (!original) throw new Error("INVENTORY_EVENT_NOT_FOUND");
        if (original.eventType !== InventoryEventType.BOOKING_RESERVATION) {
          throw new Error("ONLY_BOOKING_RESERVATIONS_CAN_BE_RELEASED");
        }
        if (original.status === InventoryEventStatus.CANCELLED) {
          throw new Error("CANCELLED_EVENT_CANNOT_BE_RELEASED");
        }

        const existing = await tx.inventoryEvent.findFirst({
          where: {
            replacesEventId: originalEventId,
            eventType: InventoryEventType.BOOKING_RELEASE,
            status: { not: InventoryEventStatus.CANCELLED },
          },
        });
        if (existing) throw new Error("INVENTORY_EVENT_ALREADY_RELEASED");

        return createEvent(tx, {
          companyId: original.companyId,
          warehouseId: original.warehouseId,
          productId: original.productId,
          eventType: InventoryEventType.BOOKING_RELEASE,
          quantity: Number(original.quantity),
          effectiveDate: new Date(),
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          sourceNumber: original.sourceNumber,
          replacesEventId: original.id,
          notes: `Release of inventory event ${original.id}`,
          createdById: userId,
        });
      });
    },

    async listEvents(filters: ListInventoryEventsInput) {
      if (filters.warehouseId) {
        await assertCompanyWarehouseScopeWithClient(
          client,
          filters.companyId,
          filters.warehouseId,
        );
      }
      return client.inventoryEvent.findMany({
        where: {
          companyId: filters.companyId,
          ...(filters.warehouseId
            ? { warehouseId: filters.warehouseId }
            : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.statuses?.length
            ? { status: { in: filters.statuses } }
            : {}),
          ...(filters.startDate || filters.endDate
            ? {
                effectiveDate: {
                  ...(filters.startDate ? { gte: filters.startDate } : {}),
                  ...(filters.endDate ? { lte: filters.endDate } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      });
    },
  };
}

const defaultService = createInventoryEventService();

export const cancelEvent = defaultService.cancelEvent;
export const completeEvent = defaultService.completeEvent;
export const createReversingEvent = defaultService.createReversingEvent;
export const listEvents = defaultService.listEvents;
