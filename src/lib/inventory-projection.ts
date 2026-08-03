import {
  eventAffectsProjection,
  getInventoryEventProjectionDate,
  getSupersededInventoryEventIds,
  inventoryEventSignedQuantity,
  type InventoryEvent,
} from "@/lib/inventory-events";
import { addCalendarDays } from "@/lib/working-days";

export type InventoryProjectionInput = {
  physicalStock: number;
  safetyStock: number;
  startDate: string;
  endDate: string;
  events: readonly InventoryEvent[];
};

export type InventoryProjectionDay = {
  date: string;
  openingQuantity: number;
  incomingQuantity: number;
  outgoingQuantity: number;
  netEventQuantity: number;
  projectedAvailableQuantity: number;
  events: InventoryEvent[];
};

export type ArrivalWindowDisplay = {
  eventId: string;
  quantity: number;
  expectedMinDate: string;
  expectedMaxDate: string;
  availableDate: string;
  visibleStartDate: string;
  visibleEndDate: string;
  sourceNumber: string | null;
};

function assertQuantity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

function projectionEvents(events: readonly InventoryEvent[]): InventoryEvent[] {
  const superseded = getSupersededInventoryEventIds(events);
  return events.filter(
    (event) =>
      eventAffectsProjection(event.status) &&
      !superseded.has(event.id),
  );
}

export function calculateInventoryProjection(
  input: InventoryProjectionInput,
): InventoryProjectionDay[] {
  assertQuantity(input.physicalStock, "Physical stock");
  assertQuantity(input.safetyStock, "Safety stock");
  addCalendarDays(input.startDate, 0);
  addCalendarDays(input.endDate, 0);

  if (input.startDate > input.endDate) {
    throw new RangeError("Projection start date cannot be after end date.");
  }

  const events = projectionEvents(input.events);
  const eventsByDate = new Map<string, InventoryEvent[]>();
  for (const event of events) {
    assertQuantity(event.quantity, "Inventory event quantity");
    const date = getInventoryEventProjectionDate(event);
    addCalendarDays(date, 0);
    const sameDayEvents = eventsByDate.get(date) ?? [];
    sameDayEvents.push(event);
    eventsByDate.set(date, sameDayEvents);
  }

  let available = input.physicalStock - input.safetyStock;

  for (const event of events) {
    if (getInventoryEventProjectionDate(event) < input.startDate) {
      available += inventoryEventSignedQuantity(event);
    }
  }

  const result: InventoryProjectionDay[] = [];
  for (
    let date = input.startDate;
    date <= input.endDate;
    date = addCalendarDays(date, 1)
  ) {
    const dayEvents = eventsByDate.get(date) ?? [];
    const signedQuantities = dayEvents.map(inventoryEventSignedQuantity);
    const incomingQuantity = signedQuantities
      .filter((quantity) => quantity > 0)
      .reduce((sum, quantity) => sum + quantity, 0);
    const outgoingQuantity = signedQuantities
      .filter((quantity) => quantity < 0)
      .reduce((sum, quantity) => sum + Math.abs(quantity), 0);
    const netEventQuantity = incomingQuantity - outgoingQuantity;
    const openingQuantity = available;
    available += netEventQuantity;

    result.push({
      date,
      openingQuantity,
      incomingQuantity,
      outgoingQuantity,
      netEventQuantity,
      projectedAvailableQuantity: available,
      events: [...dayEvents],
    });
  }

  return result;
}

export function findEarliestAvailabilityDate(
  projection: readonly InventoryProjectionDay[],
  requiredQuantity: number,
): string | null {
  assertQuantity(requiredQuantity, "Required quantity");
  return (
    projection.find(
      (day) => day.projectedAvailableQuantity >= requiredQuantity,
    )?.date ?? null
  );
}

/**
 * Earliest day D in the projection window where reserving `requiredQuantity`
 * from D through the end of the window stays covered
 * (min projectedAvailable[D..end] >= requiredQuantity).
 *
 * Used for PI booking against incoming lots: stock may arrive after dispatch
 * min but still within the committed dispatch max.
 */
export function findFeasibleReservationStartDate(
  projection: readonly InventoryProjectionDay[],
  requiredQuantity: number,
): string | null {
  assertQuantity(requiredQuantity, "Required quantity");
  if (projection.length === 0) return null;

  const suffixMin = new Array<number>(projection.length);
  const last = projection.length - 1;
  suffixMin[last] = projection[last]!.projectedAvailableQuantity;
  for (let i = last - 1; i >= 0; i -= 1) {
    suffixMin[i] = Math.min(
      projection[i]!.projectedAvailableQuantity,
      suffixMin[i + 1]!,
    );
  }

  for (let i = 0; i < projection.length; i += 1) {
    if (suffixMin[i]! >= requiredQuantity) {
      return projection[i]!.date;
    }
  }
  return null;
}

export function getEarliestAvailabilityDate(
  input: InventoryProjectionInput,
  requiredQuantity: number,
): string | null {
  return findEarliestAvailabilityDate(
    calculateInventoryProjection(input),
    requiredQuantity,
  );
}

export function getArrivalWindowDisplayData(
  events: readonly InventoryEvent[],
  startDate: string,
  endDate: string,
): ArrivalWindowDisplay[] {
  addCalendarDays(startDate, 0);
  addCalendarDays(endDate, 0);
  if (startDate > endDate) {
    throw new RangeError("Display start date cannot be after end date.");
  }

  return projectionEvents(events)
    .filter(
      (event) =>
        event.eventType === "PURCHASE_INCOMING" &&
        event.quantity > 0 &&
        event.expectedMinDate &&
        event.expectedMaxDate &&
        event.expectedMinDate <= event.expectedMaxDate &&
        event.expectedMaxDate >= startDate &&
        event.expectedMinDate <= endDate,
    )
    .map((event) => ({
      eventId: event.id,
      quantity: event.quantity,
      expectedMinDate: event.expectedMinDate as string,
      expectedMaxDate: event.expectedMaxDate as string,
      availableDate: event.expectedMaxDate as string,
      visibleStartDate:
        (event.expectedMinDate as string) < startDate
          ? startDate
          : (event.expectedMinDate as string),
      visibleEndDate:
        (event.expectedMaxDate as string) > endDate
          ? endDate
          : (event.expectedMaxDate as string),
      sourceNumber: event.sourceNumber ?? null,
    }));
}
