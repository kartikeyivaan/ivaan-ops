/**
 * Trace the exact projected-stock check used when booking a PI.
 *
 *   npx tsx scripts/trace-pi-booking-stock.ts PCMV-PI-26-27-00199
 *   npx tsx scripts/trace-pi-booking-stock.ts PCMV-PI-26-27-00199 --warehouse <uuid-or-code>
 */
import {
  InventoryEventStatus,
  InventoryEventType,
  PrismaClient,
} from "@prisma/client";

import { getCompanyAvailableQty } from "../src/lib/cross-company-transfer-service";
import {
  bookingShortageQty,
  resolveCoverageProjectionEndDate,
} from "../src/lib/pi-service";
import { findFeasibleReservationStartDate } from "../src/lib/inventory-projection";
import { getInventoryProjection } from "../src/lib/inventory-projection-service";
import { getWarehouseStockForProduct } from "../src/lib/inventory-service";
import {
  explodeItemsForFulfillment,
  mergeFulfillmentQuantities,
} from "../src/lib/kit-fulfillment";
import { resolveSafetyQty } from "../src/lib/safety-stock";
import { addCalendarDays } from "../src/lib/working-days";
import { createWorkingDaysService } from "../src/lib/working-days-service";

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  const inline = process.argv.find((v) => v.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function decimalToNumber(value: unknown): number {
  return Number(value);
}

async function main() {
  const piNo = process.argv.find((a) => a.startsWith("PCMV-") || a.startsWith("ISE-"))
    ?? process.argv[2];
  if (!piNo || piNo.startsWith("--")) {
    throw new Error("Usage: npx tsx scripts/trace-pi-booking-stock.ts <PI-NO> [--warehouse <id|code|name>]");
  }

  const warehouseFilter = argValue("--warehouse");

  const pi = await prisma.proformaInvoice.findFirst({
    where: { piNo },
    include: {
      company: { select: { id: true, code: true, name: true } },
      customer: { select: { customerName: true } },
      quotation: {
        select: {
          deliveryTermMode: true,
          dispatchMinDays: true,
          dispatchMaxDays: true,
        },
      },
      warehouse: { select: { id: true, code: true, name: true } },
      items: {
        include: {
          product: {
            include: { category: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!pi) {
    console.log(`PI not found: ${piNo}`);
    return;
  }

  console.log("=== PI ===");
  console.log({
    piNo: pi.piNo,
    status: pi.status,
    company: `${pi.company.code} (${pi.company.name})`,
    customer: pi.customer.customerName,
    savedWarehouse: pi.warehouse
      ? `${pi.warehouse.code ?? "—"} ${pi.warehouse.name}`
      : null,
    deliveryTermMode: pi.deliveryTermMode ?? pi.quotation?.deliveryTermMode ?? null,
    dispatchMinDays: pi.dispatchMinDays ?? pi.quotation?.dispatchMinDays ?? null,
    dispatchMaxDays: pi.dispatchMaxDays ?? pi.quotation?.dispatchMaxDays ?? null,
  });

  console.log("\n=== PI lines ===");
  for (const item of pi.items) {
    console.log({
      product: item.product.displayName,
      category: item.product.category.name,
      qty: decimalToNumber(item.qty),
      dispatchedQty: decimalToNumber(item.dispatchedQty),
      serialTracking: item.product.serialTracking,
    });
  }

  const fulfillmentLines = await explodeItemsForFulfillment(
    prisma,
    pi.items.map((item) => ({
      productId: item.productId,
      qty: decimalToNumber(item.qty),
      serialTracking: item.product.serialTracking,
      displayName: item.product.displayName,
      categoryName: item.product.category.name,
    })),
  );
  const quantitiesByProduct = mergeFulfillmentQuantities(fulfillmentLines);

  console.log("\n=== Fulfillment qty after kit explode ===");
  for (const [productId, entry] of quantitiesByProduct) {
    console.log({ productId, ...entry });
  }

  const uuidLike =
    Boolean(warehouseFilter) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      warehouseFilter!,
    );
  const warehouses = await prisma.warehouse.findMany({
    where: {
      companyId: pi.companyId,
      isActive: true,
      ...(warehouseFilter
        ? {
            OR: [
              ...(uuidLike ? [{ id: warehouseFilter! }] : []),
              { code: { equals: warehouseFilter, mode: "insensitive" as const } },
              { name: { contains: warehouseFilter, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });

  if (warehouses.length === 0) {
    console.log("\nNo matching active warehouses.");
    return;
  }

  const bookingDateString = new Date().toISOString().slice(0, 10);
  const mode = pi.deliveryTermMode ?? pi.quotation?.deliveryTermMode ?? null;
  const minDays =
    mode === "READY_STOCK"
      ? 0
      : (pi.dispatchMinDays ?? pi.quotation?.dispatchMinDays ?? 0);
  const maxDays =
    mode === "READY_STOCK"
      ? 0
      : (pi.dispatchMaxDays ?? pi.quotation?.dispatchMaxDays ?? minDays);
  const workingDays = createWorkingDaysService(prisma);

  for (const warehouse of warehouses) {
    console.log(`\n========== WAREHOUSE ${warehouse.code ?? "—"} (${warehouse.name}) ==========`);

    const [dispatchMinString, dispatchMaxString] = await Promise.all([
      workingDays.getNextWorkingDate(
        pi.companyId,
        warehouse.id,
        addCalendarDays(bookingDateString, minDays),
      ),
      workingDays.getNextWorkingDate(
        pi.companyId,
        warehouse.id,
        addCalendarDays(bookingDateString, maxDays),
      ),
    ]);

    console.log({
      bookingDate: bookingDateString,
      mode,
      minDays,
      maxDays,
      dispatchMin: dispatchMinString,
      dispatchMax: dispatchMaxString,
    });

    const shortages: Array<{
      product: string;
      requiredQty: number;
      bestProjected: number;
      shortageQty: number;
      reservationStart: string | null;
    }> = [];

    for (const [productId, entry] of quantitiesByProduct) {
      const stock = await getWarehouseStockForProduct(
        prisma,
        pi.companyId,
        productId,
        warehouse.id,
      );
      const safetyOverride = await prisma.inventorySafetyStock.findFirst({
        where: {
          companyId: pi.companyId,
          warehouseId: warehouse.id,
          productId,
          isActive: true,
          effectiveFrom: { lte: new Date(`${dispatchMinString}T00:00:00.000Z`) },
        },
        orderBy: { effectiveFrom: "desc" },
      });
      const safetyStock = resolveSafetyQty(
        safetyOverride ? Number(safetyOverride.safetyQty) : null,
      );

      const incomingLots = await prisma.inventoryLot.findMany({
        where: {
          companyId: pi.companyId,
          warehouseId: warehouse.id,
          productId,
          status: "INCOMING",
          expectedMaxDate: { gte: new Date(`${dispatchMinString}T00:00:00.000Z`) },
        },
        select: {
          lotNumber: true,
          quantity: true,
          receivedQuantity: true,
          damagedQuantity: true,
          expectedMinDate: true,
          expectedMaxDate: true,
        },
      });

      const incomingMax = incomingLots
        .map((lot) => {
          const pending =
            Number(lot.quantity) -
            Number(lot.receivedQuantity) -
            Number(lot.damagedQuantity);
          if (pending <= 1e-9 || !lot.expectedMaxDate) return null;
          return lot.expectedMaxDate.toISOString().slice(0, 10);
        })
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1);

      const projectionEnd = resolveCoverageProjectionEndDate(
        dispatchMaxString,
        [incomingMax],
      );

      const projection = await getInventoryProjection({
        companyId: pi.companyId,
        warehouseId: warehouse.id,
        productId,
        startDate: dispatchMinString,
        endDate: projectionEnd,
      });

      const reservationStart = findFeasibleReservationStartDate(
        projection,
        entry.qty,
      );
      const bestProjected = projection.length
        ? Math.max(...projection.map((d) => d.projectedAvailableQuantity))
        : 0;
      const shortageQty = bookingShortageQty(entry.qty, bestProjected);

      console.log(`\n--- ${entry.displayName} ---`);
      console.log({
        requiredQty: entry.qty,
        availableStock: stock.availableStock,
        bookedStock: stock.bookedStock,
        physicalBaselineUsedByProjection:
          stock.availableStock + stock.bookedStock,
        safetyStock,
        safetyOverrideId: safetyOverride?.id ?? null,
        pendingIncomingLots: incomingLots.map((lot) => ({
          lotNumber: lot.lotNumber,
          pending:
            Number(lot.quantity) -
            Number(lot.receivedQuantity) -
            Number(lot.damagedQuantity),
          expectedMin: lot.expectedMinDate?.toISOString().slice(0, 10) ?? null,
          expectedMax: lot.expectedMaxDate?.toISOString().slice(0, 10) ?? null,
        })),
        projectionWindow: `${dispatchMinString} .. ${projectionEnd}`,
        bestProjectedAvailable: bestProjected,
        reservationStart,
        shortageQty,
        wouldPassLocally: Boolean(reservationStart),
      });

      // Show projection day-by-day (short windows) or sample
      const daysToShow =
        projection.length <= 21
          ? projection
          : [
              ...projection.slice(0, 5),
              ...projection.slice(-5),
            ];
      console.log(
        "projection days:",
        daysToShow.map((d) => ({
          date: d.date,
          open: d.openingQuantity,
          in: d.incomingQuantity,
          out: d.outgoingQuantity,
          avail: d.projectedAvailableQuantity,
          events: d.events.map((e) => ({
            type: e.eventType,
            qty: e.quantity,
            source: e.sourceNumber,
            status: e.status,
          })),
        })),
      );

      const events = await prisma.inventoryEvent.findMany({
        where: {
          companyId: pi.companyId,
          warehouseId: warehouse.id,
          productId,
          status: InventoryEventStatus.ACTIVE,
          eventType: {
            in: [
              InventoryEventType.BOOKING_RESERVATION,
              InventoryEventType.PLANNED_DISPATCH,
              InventoryEventType.ACTUAL_DISPATCH,
              InventoryEventType.PURCHASE_INCOMING,
              InventoryEventType.BOOKING_RELEASE,
              InventoryEventType.STOCK_TRANSFER_OUT,
              InventoryEventType.STOCK_TRANSFER_IN,
              InventoryEventType.MANUAL_ADJUSTMENT_OUT,
              InventoryEventType.MANUAL_ADJUSTMENT_IN,
            ],
          },
        },
        orderBy: { effectiveDate: "asc" },
        select: {
          id: true,
          eventType: true,
          quantity: true,
          effectiveDate: true,
          expectedMinDate: true,
          expectedMaxDate: true,
          sourceType: true,
          sourceId: true,
          sourceNumber: true,
          replacesEventId: true,
        },
      });

      // Summarize what already reduced projected stock before the dispatch window
      const preWindowOut = events
        .filter((e) => {
          const date =
            e.eventType === InventoryEventType.BOOKING_RESERVATION &&
            e.expectedMinDate
              ? e.expectedMinDate.toISOString().slice(0, 10)
              : e.eventType === InventoryEventType.PURCHASE_INCOMING &&
                  e.expectedMaxDate
                ? e.expectedMaxDate.toISOString().slice(0, 10)
                : e.effectiveDate.toISOString().slice(0, 10);
          return date < dispatchMinString;
        })
        .reduce((sum, e) => {
          if (
            e.eventType === InventoryEventType.BOOKING_RESERVATION ||
            e.eventType === InventoryEventType.PLANNED_DISPATCH ||
            e.eventType === InventoryEventType.ACTUAL_DISPATCH ||
            e.eventType === InventoryEventType.STOCK_TRANSFER_OUT ||
            e.eventType === InventoryEventType.MANUAL_ADJUSTMENT_OUT
          ) {
            return sum + Number(e.quantity);
          }
          if (
            e.eventType === InventoryEventType.PURCHASE_INCOMING ||
            e.eventType === InventoryEventType.STOCK_TRANSFER_IN ||
            e.eventType === InventoryEventType.MANUAL_ADJUSTMENT_IN ||
            e.eventType === InventoryEventType.BOOKING_RELEASE
          ) {
            return sum - Number(e.quantity);
          }
          return sum;
        }, 0);

      const reservationEvents = events.filter(
        (e) => e.eventType === InventoryEventType.BOOKING_RESERVATION,
      );
      const reservationTotal = reservationEvents.reduce(
        (s, e) => s + Number(e.quantity),
        0,
      );

      console.log({
        preWindowNetOutgoingApprox: preWindowOut,
        activeBookingReservationCount: reservationEvents.length,
        activeBookingReservationQtyRaw: reservationTotal,
        otherActiveEventCount: events.length - reservationEvents.length,
      });

      const reservationPiIds = [
        ...new Set(
          reservationEvents
            .filter((e) => e.sourceType === "PROFORMA_INVOICE" && e.sourceId)
            .map((e) => e.sourceId as string),
        ),
      ];
      if (reservationPiIds.length > 0) {
        const piRows = await prisma.proformaInvoice.findMany({
          where: { id: { in: reservationPiIds } },
          select: {
            id: true,
            piNo: true,
            status: true,
            items: {
              where: { productId },
              select: { qty: true, dispatchedQty: true },
            },
          },
        });
        console.log(
          "other PIs with reservation events for this product:",
          piRows.map((row) => {
            const lineQty = row.items.reduce((s, i) => s + Number(i.qty), 0);
            const dispatched = row.items.reduce(
              (s, i) => s + Number(i.dispatchedQty),
              0,
            );
            const eventQty = reservationEvents
              .filter((e) => e.sourceId === row.id)
              .reduce((s, e) => s + Number(e.quantity), 0);
            return {
              piNo: row.piNo,
              status: row.status,
              lineQty,
              dispatched,
              remainingOpen: Math.max(0, lineQty - dispatched),
              reservationEventQty: eventQty,
            };
          }),
        );
      }

      console.log(
        "non-reservation active events:",
        events
          .filter((e) => e.eventType !== InventoryEventType.BOOKING_RESERVATION)
          .map((e) => ({
            type: e.eventType,
            qty: Number(e.quantity),
            effective: e.effectiveDate.toISOString().slice(0, 10),
            expectedMin: e.expectedMinDate?.toISOString().slice(0, 10) ?? null,
            expectedMax: e.expectedMaxDate?.toISOString().slice(0, 10) ?? null,
            source: e.sourceNumber,
          })),
      );

      if (!reservationStart) {
        shortages.push({
          product: entry.displayName,
          requiredQty: entry.qty,
          bestProjected,
          shortageQty,
          reservationStart,
        });
      }
    }

    if (shortages.length === 0) {
      console.log("\nRESULT: LOCAL OK — booking would succeed at this warehouse.");
      continue;
    }

    console.log("\nLocal shortages:", shortages);

    const otherCompanies = await prisma.company.findMany({
      where: { id: { not: pi.companyId }, isPractice: false },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    });
    const covering: string[] = [];
    for (const company of otherCompanies) {
      let canCoverAll = true;
      const detail: Array<{ product: string; available: number; need: number }> = [];
      for (const line of shortages) {
        const productId = [...quantitiesByProduct.entries()].find(
          ([, e]) => e.displayName === line.product,
        )?.[0];
        if (!productId) {
          canCoverAll = false;
          break;
        }
        const available = await getCompanyAvailableQty(
          prisma,
          company.id,
          productId,
        );
        detail.push({
          product: line.product,
          available,
          need: line.shortageQty,
        });
        if (available < line.shortageQty) canCoverAll = false;
      }
      console.log(`cross-company ${company.code}:`, { canCoverAll, detail });
      if (canCoverAll) covering.push(company.code);
    }

    if (covering.length === 0) {
      console.log(
        `\nRESULT: UNAVAILABLE — same message as UI (short by ${shortages[0]!.shortageQty} for ${shortages[0]!.product}).`,
      );
    } else {
      console.log(
        `\nRESULT: NEED_APPROVAL — covering companies: ${covering.join(", ")}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
