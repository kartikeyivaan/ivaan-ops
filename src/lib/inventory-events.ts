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

export type DispatchTodayEventStatus = "Pending" | "Dispatched";

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
  customerName?: string | null;
  replacesEventId?: string | null;
  /** Present when this reservation is marked Dispatch Today. */
  dispatchTodayStatus?: DispatchTodayEventStatus | null;
  /** Full PI quantity for Dispatch Today display (may differ from product-line quantity). */
  displayQuantity?: number | null;
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
    "eventType" | "effectiveDate" | "expectedMinDate" | "expectedMaxDate"
  >,
): string {
  if (event.eventType === "PURCHASE_INCOMING" && event.expectedMaxDate) {
    return event.expectedMaxDate;
  }

  // Booking reservations reduce sales-available stock on the first day of the
  // committed dispatch window, not on the booking confirmation day.
  if (
    event.eventType === "BOOKING_RESERVATION" &&
    event.expectedMinDate
  ) {
    return event.expectedMinDate;
  }

  return event.effectiveDate;
}

/**
 * Events that should not affect projection because a later linked event
 * already accounts for the same stock movement (actual dispatch, booking release).
 */
export function getSupersededInventoryEventIds(
  events: readonly InventoryEvent[],
): Set<string> {
  const superseded = new Set<string>();
  const activeEvents = events.filter((event) =>
    eventAffectsProjection(event.status),
  );

  for (const event of activeEvents) {
    if (event.eventType === "ACTUAL_DISPATCH") {
      if (event.replacesEventId) {
        superseded.add(event.replacesEventId);
      }

      if (event.sourceType && event.sourceId) {
        for (const candidate of activeEvents) {
          if (
            candidate.eventType === "PLANNED_DISPATCH" &&
            candidate.sourceType === event.sourceType &&
            candidate.sourceId === event.sourceId
          ) {
            superseded.add(candidate.id);
          }
        }
      }
    }

    if (
      event.eventType === "BOOKING_RELEASE" &&
      event.replacesEventId
    ) {
      // Drop both the reservation and its release so released bookings never
      // reduce (or later restore) projected availability.
      superseded.add(event.replacesEventId);
      superseded.add(event.id);
    }
  }

  return superseded;
}

/**
 * Reduce or drop booking reservations to the PI's remaining open quantity.
 * Fully dispatched / cancelled PIs keep leftover BOOKING_RESERVATION events
 * when a BOOKING_RELEASE was never written; those must not keep reducing
 * reserved or projected availability.
 */
export function applyRemainingPiQtyToBookingReservations(
  events: readonly InventoryEvent[],
  remainingByPiId: ReadonlyMap<string, number>,
): InventoryEvent[] {
  const adjusted: InventoryEvent[] = [];
  for (const event of events) {
    if (
      event.eventType !== "BOOKING_RESERVATION" ||
      event.sourceType !== "PROFORMA_INVOICE" ||
      !event.sourceId ||
      !remainingByPiId.has(event.sourceId)
    ) {
      adjusted.push(event);
      continue;
    }

    const remaining = remainingByPiId.get(event.sourceId) ?? 0;
    const quantity = Math.max(0, Math.min(event.quantity, remaining));
    if (quantity <= 0) continue;
    adjusted.push(quantity === event.quantity ? event : { ...event, quantity });
  }
  return adjusted;
}

/**
 * Prepare inventory events for projection against a *live* physical baseline
 * (available + booked already excludes dispatched stock).
 *
 * - Drops ACTUAL_DISPATCH: those units already left physical stock.
 * - Drops BOOKING_RESERVATION once dispatched qty for that PI covers it
 *   (dispatch confirm historically did not always emit BOOKING_RELEASE).
 * - Still honors PLANNED_DISPATCH / BOOKING_RELEASE supersession links.
 */
export function filterEventsForLivePhysicalProjection(
  events: readonly InventoryEvent[],
  dispatchedQtyByPiId: ReadonlyMap<string, number> = new Map(),
): InventoryEvent[] {
  const superseded = getSupersededInventoryEventIds(events);

  for (const event of events) {
    if (!eventAffectsProjection(event.status)) continue;
    if (superseded.has(event.id)) continue;
    if (event.eventType !== "BOOKING_RESERVATION") continue;
    if (event.sourceType !== "PROFORMA_INVOICE" || !event.sourceId) continue;
    const dispatchedQty = dispatchedQtyByPiId.get(event.sourceId) ?? 0;
    if (dispatchedQty + 1e-9 >= event.quantity) {
      superseded.add(event.id);
    }
  }

  return events.filter(
    (event) =>
      eventAffectsProjection(event.status) &&
      !superseded.has(event.id) &&
      event.eventType !== "ACTUAL_DISPATCH",
  );
}

/**
 * PURCHASE_INCOMING events are created for the full lot quantity. After partial
 * inward, physical stock already includes received units, so projection must use
 * the lot's remaining pending quantity to avoid double-counting.
 */
export function applyPendingIncomingToPurchaseEvents(
  events: readonly InventoryEvent[],
  lotsById: ReadonlyMap<
    string,
    { quantity: number; receivedQuantity: number; damagedQuantity: number }
  >,
): InventoryEvent[] {
  return events.map((event) => {
    if (
      event.eventType !== "PURCHASE_INCOMING" ||
      event.sourceType !== "INVENTORY_LOT" ||
      !event.sourceId
    ) {
      return event;
    }

    const lot = lotsById.get(event.sourceId);
    if (!lot) return event;

    const remaining = Math.max(
      0,
      lot.quantity - lot.receivedQuantity - lot.damagedQuantity,
    );
    if (remaining === event.quantity) return event;
    return { ...event, quantity: remaining };
  });
}
