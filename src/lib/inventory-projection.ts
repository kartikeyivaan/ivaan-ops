import {
  eventAffectsProjection,
  getInventoryEventProjectionDate,
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

function supersededPlannedEventIds(events: readonly InventoryEvent[]): Set<string> {
  const superseded = new Set<string>();
  const activeActualDispatches = events.filter(
    (event) =>
      event.eventType === "ACTUAL_DISPATCH" &&
      eventAffectsProjection(event.status),
  );

  for (const actual of activeActualDispatches) {
    if (actual.replacesEventId) {
      superseded.add(actual.replacesEventId);
    }

    if (actual.sourceType && actual.sourceId) {
      for (const candidate of events) {
        if (
          candidate.eventType === "PLANNED_DISPATCH" &&
          candidate.sourceType === actual.sourceType &&
          candidate.sourceId === actual.sourceId
        ) {
          superseded.add(candidate.id);
        }
      }
    }
  }

  return superseded;
}

function projectionEvents(events: readonly InventoryEvent[]): InventoryEvent[] {
  const superseded = supersededPlannedEventIds(events);
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
