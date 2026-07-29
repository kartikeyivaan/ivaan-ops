export const INVENTORY_EVENT_TYPES = [
  "OPENING_STOCK",
  "MANUAL_ADJUSTMENT_IN",
  "MANUAL_ADJUSTMENT_OUT",
  "PURCHASE_INCOMING",
  "STOCK_TRANSFER_IN",
  "STOCK_TRANSFER_OUT",
  "BOOKING_RESERVATION",
  "BOOKING_RELEASE",
  "PLANNED_DISPATCH",
  "ACTUAL_DISPATCH",
  "RETURN_IN",
  "RETURN_OUT",
] as const;

export type InventoryEventType = (typeof INVENTORY_EVENT_TYPES)[number];

export const INVENTORY_EVENT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export type InventoryEventStatus = (typeof INVENTORY_EVENT_STATUSES)[number];
export type InventoryQuantityEffect = "INCREASE" | "DECREASE";

export const INVENTORY_EVENT_EFFECTS: Record<
  InventoryEventType,
  InventoryQuantityEffect
> = {
  OPENING_STOCK: "INCREASE",
  MANUAL_ADJUSTMENT_IN: "INCREASE",
  MANUAL_ADJUSTMENT_OUT: "DECREASE",
  PURCHASE_INCOMING: "INCREASE",
  STOCK_TRANSFER_IN: "INCREASE",
  STOCK_TRANSFER_OUT: "DECREASE",
  BOOKING_RESERVATION: "DECREASE",
  BOOKING_RELEASE: "INCREASE",
  PLANNED_DISPATCH: "DECREASE",
  ACTUAL_DISPATCH: "DECREASE",
  RETURN_IN: "INCREASE",
  RETURN_OUT: "DECREASE",
};

export type InventoryEvent = {
  id: string;
  eventType: InventoryEventType;
  status: InventoryEventStatus;
  quantity: number;
  effectiveDate: string;
  expectedMinDate?: string | null;
  expectedMaxDate?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceNumber?: string | null;
  replacesEventId?: string | null;
};

export function getInventoryEventEffect(
  eventType: InventoryEventType,
): InventoryQuantityEffect {
  return INVENTORY_EVENT_EFFECTS[eventType];
}

export function toSignedInventoryQuantity(
  eventType: InventoryEventType,
  quantity: number,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError("Inventory event quantity must be a finite non-negative number.");
  }

  return getInventoryEventEffect(eventType) === "INCREASE" ? quantity : -quantity;
}

export function eventAffectsProjection(
  status: InventoryEventStatus,
): boolean {
  return status === "ACTIVE" || status === "COMPLETED";
}

export function inventoryEventSignedQuantity(
  event: Pick<InventoryEvent, "eventType" | "quantity" | "status">,
): number {
  return eventAffectsProjection(event.status)
    ? toSignedInventoryQuantity(event.eventType, event.quantity)
    : 0;
}

export function getInventoryEventProjectionDate(
  event: Pick<
    InventoryEvent,
    "eventType" | "effectiveDate" | "expectedMaxDate"
  >,
): string {
  if (event.eventType === "PURCHASE_INCOMING" && event.expectedMaxDate) {
    return event.expectedMaxDate;
  }

  return event.effectiveDate;
}
