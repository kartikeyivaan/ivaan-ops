import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find the 610 Wp product
  const product = await prisma.product.findFirst({
    where: { displayName: { contains: "610 Wp", mode: "insensitive" } },
    select: { id: true, displayName: true },
  });
  if (!product) { console.log("Product not found"); return; }
  console.log(`Product: ${product.displayName} (${product.id})\n`);

  // All active BOOKING_RESERVATION events for this product
  const reservations = await prisma.inventoryEvent.findMany({
    where: {
      productId: product.id,
      eventType: "BOOKING_RESERVATION",
      status: "ACTIVE",
    },
    select: { id: true, sourceId: true, sourceNumber: true, quantity: true },
  });

  // Check which have releases
  const releases = await prisma.inventoryEvent.findMany({
    where: {
      eventType: "BOOKING_RELEASE",
      status: "ACTIVE",
      replacesEventId: { in: reservations.map((r) => r.id) },
    },
    select: { replacesEventId: true },
  });
  const releasedIds = new Set(releases.map((r) => r.replacesEventId));
  const unreleased = reservations.filter((r) => !releasedIds.has(r.id));

  console.log(`Unreleased reservation events: ${unreleased.length}`);
  console.log(`Total raw qty: ${unreleased.reduce((s, r) => s + Number(r.quantity), 0)}\n`);

  // For each, check PI status AND whether PI still has items for this product
  const piIds = [...new Set(unreleased.map((r) => r.sourceId).filter(Boolean))] as string[];
  const pis = await prisma.proformaInvoice.findMany({
    where: { id: { in: piIds } },
    select: {
      id: true, piNo: true, status: true,
      items: { where: { productId: product.id }, select: { qty: true, dispatchedQty: true } },
    },
  });
  const piMap = new Map(pis.map((pi) => [pi.id, pi]));

  let passThrough = 0; // events that bypass the cap
  let capped = 0;      // events properly capped
  for (const r of unreleased) {
    const pi = r.sourceId ? piMap.get(r.sourceId) : undefined;
    const hasItem = pi && pi.items.length > 0;
    const qty = Number(r.quantity);

    if (!pi || !hasItem) {
      // This PI is NOT in remainingByPiId → event passes through uncapped!
      passThrough += qty;
      console.log(`  [UNCAPPED - passes through] ${r.sourceNumber} | Status: ${pi?.status ?? "N/A"} | Has item: ${hasItem} | Qty: ${qty}`);
    } else {
      const remaining = pi.items.reduce((s, i) => s + Math.max(0, Number(i.qty) - Number(i.dispatchedQty)), 0);
      capped += Math.min(qty, remaining);
      console.log(`  [CAPPED] ${r.sourceNumber} | Status: ${pi.status} | Remaining: ${remaining} | Event qty: ${qty} | Effective: ${Math.min(qty, remaining)}`);
    }
  }

  console.log(`\n=== RESULT ===`);
  console.log(`  Properly capped qty: ${capped}`);
  console.log(`  Uncapped pass-through qty: ${passThrough}`);
  console.log(`  DISPLAYED RESERVED = ${capped + passThrough}`);
  console.log(`  EXPECTED RESERVED = ${capped}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
