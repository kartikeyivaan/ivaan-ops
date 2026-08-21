import {
  InventoryEventStatus,
  InventoryEventType,
  PrismaClient,
} from "@prisma/client";
import {
  applyPendingIncomingToPurchaseEvents,
  applyRemainingPiQtyToBookingReservations,
  filterEventsForLivePhysicalProjection,
  getInventoryEventProjectionDate,
  inventoryEventSignedQuantity,
  type InventoryEvent,
} from "../src/lib/inventory-events";
import { getInventoryProjection } from "../src/lib/inventory-projection-service";
import { getWarehouseStockForProduct } from "../src/lib/inventory-service";

const prisma = new PrismaClient();
const productId = "db7c1b74-5823-44f0-ac91-c82d19f13dda";

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "PCMV" } });
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company!.id, code: "JAL-HO" },
  });
  if (!company || !warehouse) throw new Error("company/warehouse missing");

  const startDate = "2026-08-21";
  const endDate = "2026-08-21";
  const stock = await getWarehouseStockForProduct(
    prisma,
    company.id,
    productId,
    warehouse.id,
  );
  console.log("stock", stock);

  const rows = await prisma.inventoryEvent.findMany({
    where: {
      companyId: company.id,
      warehouseId: warehouse.id,
      productId,
      status: {
        in: [InventoryEventStatus.ACTIVE, InventoryEventStatus.COMPLETED],
      },
      OR: [
        { effectiveDate: { lte: new Date(`${endDate}T00:00:00.000Z`) } },
        { expectedMinDate: { lte: new Date(`${endDate}T00:00:00.000Z`) } },
        { expectedMaxDate: { lte: new Date(`${endDate}T00:00:00.000Z`) } },
      ],
    },
  });

  const reservationPiIds = [
    ...new Set(
      rows
        .filter(
          (e) =>
            e.eventType === InventoryEventType.BOOKING_RESERVATION &&
            e.sourceId,
        )
        .map((e) => e.sourceId!),
    ),
  ];
  const piItems = await prisma.proformaInvoiceItem.findMany({
    where: { piId: { in: reservationPiIds }, productId },
    select: {
      piId: true,
      qty: true,
      dispatchedQty: true,
      proformaInvoice: { select: { piNo: true, status: true } },
    },
  });
  const remainingByPiId = new Map<string, number>();
  for (const item of piItems) {
    remainingByPiId.set(
      item.piId,
      (remainingByPiId.get(item.piId) ?? 0) + Number(item.qty),
    );
  }

  const dispatchEvents = rows.filter(
    (e) =>
      e.eventType === InventoryEventType.ACTUAL_DISPATCH &&
      e.sourceType === "DISPATCH" &&
      e.sourceId,
  );
  const dispatches = await prisma.dispatch.findMany({
    where: { id: { in: [...new Set(dispatchEvents.map((e) => e.sourceId!))] } },
    select: { id: true, proformaInvoiceId: true },
  });
  const dispatchToPi = new Map(
    dispatches.map((d) => [d.id, d.proformaInvoiceId]),
  );
  const dispatchedQtyByPiId = new Map<string, number>();
  for (const e of dispatchEvents) {
    const piId = dispatchToPi.get(e.sourceId!);
    if (!piId) continue;
    dispatchedQtyByPiId.set(
      piId,
      (dispatchedQtyByPiId.get(piId) ?? 0) + Number(e.quantity),
    );
  }

  const lotIds = rows
    .filter((e) => e.sourceType === "INVENTORY_LOT" && e.sourceId)
    .map((e) => e.sourceId!);
  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: lotIds } },
    select: {
      id: true,
      quantity: true,
      receivedQuantity: true,
      damagedQuantity: true,
    },
  });
  const lotsById = new Map(
    lots.map((l) => [
      l.id,
      {
        quantity: Number(l.quantity),
        receivedQuantity: Number(l.receivedQuantity),
        damagedQuantity: Number(l.damagedQuantity),
      },
    ]),
  );

  const mapped: InventoryEvent[] = rows.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    quantity: Number(e.quantity),
    status: e.status,
    effectiveDate: e.effectiveDate.toISOString().slice(0, 10),
    expectedMinDate: e.expectedMinDate?.toISOString().slice(0, 10) ?? null,
    expectedMaxDate: e.expectedMaxDate?.toISOString().slice(0, 10) ?? null,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    sourceNumber: e.sourceNumber,
    replacesEventId: e.replacesEventId,
  }));

  const adjusted = filterEventsForLivePhysicalProjection(
    applyRemainingPiQtyToBookingReservations(
      applyPendingIncomingToPurchaseEvents(mapped, lotsById),
      remainingByPiId,
    ),
    dispatchedQtyByPiId,
  );

  const baseline = stock.availableStock + stock.bookedStock;
  console.log("baseline", baseline);

  const preAndOn = adjusted
    .map((e) => ({
      e,
      date: getInventoryEventProjectionDate(e),
      signed: inventoryEventSignedQuantity(e),
    }))
    .filter((x) => x.date < startDate && x.signed !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  let avail = baseline;
  const bySource = new Map<string, number>();
  for (const x of preAndOn) {
    avail += x.signed;
    const key = `${x.e.sourceNumber ?? "(none)"}|${x.e.eventType}`;
    bySource.set(key, (bySource.get(key) ?? 0) + x.signed);
    console.log(
      JSON.stringify({
        date: x.date,
        type: x.e.eventType,
        qty: x.e.quantity,
        signed: x.signed,
        source: x.e.sourceNumber,
        availAfter: avail,
      }),
    );
  }
  console.log("opening after pre-window", avail);
  console.log(
    "net by source",
    [...bySource.entries()].sort((a, b) => a[1] - b[1]),
  );

  // Show PI status for any surviving negative reservation
  const survivingReservations = preAndOn.filter(
    (x) => x.e.eventType === InventoryEventType.BOOKING_RESERVATION,
  );
  for (const x of survivingReservations) {
    const item = piItems.find((i) => i.piId === x.e.sourceId);
    console.log("surviving reservation", {
      source: x.e.sourceNumber,
      eventQty: x.e.quantity,
      signed: x.signed,
      piStatus: item?.proformaInvoice.status ?? "NO_ITEM",
      lineQty: item ? Number(item.qty) : null,
      dispatchedLine: item ? Number(item.dispatchedQty) : null,
      dispatchedFromEvents: x.e.sourceId
        ? (dispatchedQtyByPiId.get(x.e.sourceId) ?? 0)
        : null,
      remainingMapQty: x.e.sourceId
        ? (remainingByPiId.get(x.e.sourceId) ?? 0)
        : null,
    });
  }

  const proj = await getInventoryProjection({
    companyId: company.id,
    warehouseId: warehouse.id,
    productId,
    startDate,
    endDate,
  });
  console.log(
    "projection",
    proj.map((d) => ({
      date: d.date,
      avail: d.projectedAvailableQuantity,
      dayEvents: d.events.map((e) => `${e.eventType}:${e.quantity}:${e.sourceNumber}`),
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
