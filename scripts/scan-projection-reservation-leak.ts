import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OPEN = new Set(["BOOKED", "PARTIALLY_DISPATCHED", "CANCEL_PENDING"]);

async function main() {
  const reservations = await prisma.inventoryEvent.findMany({
    where: {
      eventType: "BOOKING_RESERVATION",
      status: "ACTIVE",
      sourceType: "PROFORMA_INVOICE",
      sourceId: { not: null },
    },
    select: {
      id: true,
      productId: true,
      quantity: true,
      sourceId: true,
      sourceNumber: true,
      product: { select: { displayName: true } },
    },
  });
  const releases = await prisma.inventoryEvent.findMany({
    where: {
      eventType: "BOOKING_RELEASE",
      status: "ACTIVE",
      replacesEventId: { in: reservations.map((r) => r.id) },
    },
    select: { replacesEventId: true },
  });
  const released = new Set(releases.map((r) => r.replacesEventId));
  const unreleased = reservations.filter((r) => !released.has(r.id));
  const piIds = [...new Set(unreleased.map((r) => r.sourceId!))];
  const pis = await prisma.proformaInvoice.findMany({
    where: { id: { in: piIds } },
    select: {
      id: true,
      piNo: true,
      status: true,
      items: { select: { productId: true, qty: true, dispatchedQty: true } },
    },
  });
  const piMap = new Map(pis.map((p) => [p.id, p]));

  type Row = {
    name: string;
    leak: number;
    examples: Array<{
      pi: string;
      status: string;
      leak: number;
      eventQty: number;
      lineQty: number;
      dispatched: number;
    }>;
  };
  const byProduct = new Map<string, Row>();

  for (const r of unreleased) {
    const pi = piMap.get(r.sourceId!);
    if (!pi) continue;
    const item = pi.items.find((i) => i.productId === r.productId);
    const lineQty = item ? Number(item.qty) : 0;
    const dispatched = item ? Number(item.dispatchedQty) : 0;
    // Current buggy projection cap (line qty only; ignores closed PI / dispatched)
    const currentCap = Math.min(Number(r.quantity), lineQty);
    const correctRemaining =
      OPEN.has(pi.status) && item ? Math.max(0, lineQty - dispatched) : 0;
    const correctCap = Math.min(Number(r.quantity), correctRemaining);
    const leak = Math.max(0, currentCap - correctCap);
    if (leak <= 0) continue;

    const entry = byProduct.get(r.productId) ?? {
      name: r.product.displayName,
      leak: 0,
      examples: [],
    };
    entry.leak += leak;
    if (entry.examples.length < 5) {
      entry.examples.push({
        pi: pi.piNo,
        status: pi.status,
        leak,
        eventQty: Number(r.quantity),
        lineQty,
        dispatched,
      });
    }
    byProduct.set(r.productId, entry);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.leak - a.leak);
  console.log(`Products with projection reservation leak: ${rows.length}`);
  let total = 0;
  for (const row of rows) {
    total += row.leak;
    console.log(JSON.stringify(row));
  }
  console.log(`TOTAL_LEAK_QTY ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
