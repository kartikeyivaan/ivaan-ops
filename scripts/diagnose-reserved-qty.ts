/**
 * Diagnose inflated reserved quantities in the stock timeline.
 *
 * Run against production:
 *   DATABASE_URL="<prod-url>" npx tsx scripts/diagnose-reserved-qty.ts
 *
 * Pass --fix to reconcile stale reservation events (dry-run by default).
 */
import { InventoryEventStatus, InventoryEventType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIX = process.argv.includes("--fix");

async function main() {
  console.log(FIX ? "=== FIX MODE ===" : "=== DRY RUN (pass --fix to apply) ===\n");

  // 1. Find all active BOOKING_RESERVATION events grouped by product + PI
  const reservations = await prisma.inventoryEvent.findMany({
    where: {
      eventType: InventoryEventType.BOOKING_RESERVATION,
      status: InventoryEventStatus.ACTIVE,
    },
    include: {
      product: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Check which have corresponding releases
  const releaseMap = new Map<string, boolean>();
  if (reservations.length > 0) {
    const releases = await prisma.inventoryEvent.findMany({
      where: {
        eventType: InventoryEventType.BOOKING_RELEASE,
        status: InventoryEventStatus.ACTIVE,
        replacesEventId: { in: reservations.map((r) => r.id) },
      },
      select: { replacesEventId: true },
    });
    for (const r of releases) {
      if (r.replacesEventId) releaseMap.set(r.replacesEventId, true);
    }
  }

  const unreleased = reservations.filter((r) => !releaseMap.has(r.id));

  console.log(`Total active BOOKING_RESERVATION events: ${reservations.length}`);
  console.log(`Already released (have BOOKING_RELEASE): ${reservations.length - unreleased.length}`);
  console.log(`Unreleased (contributing to reserved): ${unreleased.length}\n`);

  // 2. For each unreleased reservation, check the PI's current state
  const piIds = [...new Set(unreleased.map((r) => r.sourceId).filter(Boolean))] as string[];
  const pis = await prisma.proformaInvoice.findMany({
    where: { id: { in: piIds } },
    select: {
      id: true,
      piNo: true,
      status: true,
      items: { select: { productId: true, qty: true, dispatchedQty: true } },
    },
  });
  const piMap = new Map(pis.map((pi) => [pi.id, pi]));

  type Issue = {
    reservation: typeof unreleased[0];
    reason: string;
    piStatus: string | null;
    eventQty: number;
    piRemainingQty: number;
  };
  const issues: Issue[] = [];

  console.log("=== Unreleased reservation analysis ===\n");

  for (const r of unreleased) {
    const qty = Number(r.quantity);
    const pi = r.sourceId ? piMap.get(r.sourceId) : undefined;

    if (!pi) {
      console.log(`  [ORPHAN] ${r.product.displayName} | Event ${r.id} | Qty: ${qty} | PI: ${r.sourceNumber} — PI not found`);
      issues.push({ reservation: r, reason: "ORPHAN_PI", piStatus: null, eventQty: qty, piRemainingQty: 0 });
      continue;
    }

    const OPEN_STATUSES = new Set(["BOOKED", "PARTIALLY_DISPATCHED", "CANCEL_PENDING"]);
    const piItem = pi.items.find((i) => i.productId === r.productId);
    const piRemaining = piItem ? Math.max(0, Number(piItem.qty) - Number(piItem.dispatchedQty)) : 0;

    if (!OPEN_STATUSES.has(pi.status)) {
      console.log(`  [STALE STATUS] ${r.product.displayName} | ${pi.piNo} (${pi.status}) | Event qty: ${qty} | Should be 0`);
      issues.push({ reservation: r, reason: "PI_NOT_OPEN", piStatus: pi.status, eventQty: qty, piRemainingQty: 0 });
    } else if (!piItem) {
      console.log(`  [PRODUCT REMOVED] ${r.product.displayName} | ${pi.piNo} (${pi.status}) | Event qty: ${qty} | Product no longer on PI`);
      issues.push({ reservation: r, reason: "PRODUCT_REMOVED", piStatus: pi.status, eventQty: qty, piRemainingQty: 0 });
    } else if (qty > piRemaining + 0.001) {
      console.log(`  [OVER-RESERVED] ${r.product.displayName} | ${pi.piNo} (${pi.status}) | Event qty: ${qty} | PI remaining: ${piRemaining}`);
      issues.push({ reservation: r, reason: "OVER_RESERVED", piStatus: pi.status, eventQty: qty, piRemainingQty: piRemaining });
    } else {
      console.log(`  [OK] ${r.product.displayName} | ${pi.piNo} (${pi.status}) | Event qty: ${qty} | PI remaining: ${piRemaining}`);
    }
  }

  // 3. Duplicate check — multiple reservations for same PI + product
  const reservationKey = (r: typeof unreleased[0]) => `${r.sourceId}:${r.productId}`;
  const byKey = new Map<string, typeof unreleased>();
  for (const r of unreleased) {
    const key = reservationKey(r);
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const duplicates = [...byKey.entries()].filter(([_, arr]) => arr.length > 1);
  if (duplicates.length > 0) {
    console.log(`\n=== DUPLICATE reservations (same PI + product): ${duplicates.length} ===`);
    for (const [key, arr] of duplicates) {
      const totalQty = arr.reduce((sum, r) => sum + Number(r.quantity), 0);
      console.log(`  ${arr[0].sourceNumber} / ${arr[0].product.displayName}: ${arr.length} events, total qty: ${totalQty}`);
      for (const r of arr) {
        console.log(`    Event ${r.id} | Qty: ${Number(r.quantity)} | Created: ${r.createdAt.toISOString()}`);
      }
      // Keep the newest, mark others as issues
      const sorted = [...arr].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      for (let i = 1; i < sorted.length; i++) {
        if (!issues.find((is) => is.reservation.id === sorted[i].id)) {
          issues.push({
            reservation: sorted[i],
            reason: "DUPLICATE",
            piStatus: piMap.get(sorted[i].sourceId!)?.status ?? null,
            eventQty: Number(sorted[i].quantity),
            piRemainingQty: 0,
          });
        }
      }
    }
  }

  // 4. Summary by product
  console.log("\n=== Reserved qty summary by product ===");
  const byProduct = new Map<string, { name: string; eventTotal: number; adjustedTotal: number }>();
  for (const r of unreleased) {
    const key = r.productId;
    const entry = byProduct.get(key) ?? { name: r.product.displayName, eventTotal: 0, adjustedTotal: 0 };
    const qty = Number(r.quantity);
    const pi = r.sourceId ? piMap.get(r.sourceId) : undefined;
    const piItem = pi?.items.find((i) => i.productId === r.productId);
    const piRemaining = piItem ? Math.max(0, Number(piItem.qty) - Number(piItem.dispatchedQty)) : 0;
    const OPEN = new Set(["BOOKED", "PARTIALLY_DISPATCHED", "CANCEL_PENDING"]);
    const effective = pi && OPEN.has(pi.status) && piItem ? Math.min(qty, piRemaining) : 0;
    entry.eventTotal += qty;
    entry.adjustedTotal += effective;
    byProduct.set(key, entry);
  }
  for (const [_, entry] of byProduct) {
    const mismatch = entry.eventTotal !== entry.adjustedTotal ? " *** MISMATCH ***" : "";
    console.log(`  ${entry.name}: raw events = ${entry.eventTotal}, adjusted = ${entry.adjustedTotal}${mismatch}`);
  }

  // 5. Also check PI-based reserved (what the reserved-qty report shows)
  const bookedPis = await prisma.proformaInvoice.findMany({
    where: { status: { in: ["BOOKED", "PARTIALLY_DISPATCHED", "CANCEL_PENDING"] } },
    select: {
      id: true,
      piNo: true,
      status: true,
      items: {
        select: {
          productId: true,
          qty: true,
          dispatchedQty: true,
          product: { select: { displayName: true } },
        },
      },
    },
  });
  console.log("\n=== PI-based reserved qty (from PI items, not events) ===");
  const piReservedByProduct = new Map<string, { name: string; qty: number; pis: string[] }>();
  for (const pi of bookedPis) {
    for (const item of pi.items) {
      const remaining = Math.max(0, Number(item.qty) - Number(item.dispatchedQty));
      if (remaining <= 0) continue;
      const entry = piReservedByProduct.get(item.productId) ?? { name: item.product.displayName, qty: 0, pis: [] };
      entry.qty += remaining;
      entry.pis.push(`${pi.piNo}(${remaining})`);
      piReservedByProduct.set(item.productId, entry);
    }
  }
  for (const [_, entry] of piReservedByProduct) {
    console.log(`  ${entry.name}: ${entry.qty} from [${entry.pis.join(", ")}]`);
  }

  // 6. Fix issues
  if (issues.length === 0) {
    console.log("\n✓ No issues found. Reservation events are consistent.");
    return;
  }

  console.log(`\n=== ${issues.length} issues found ===`);
  const excessQty = issues.reduce((sum, i) => sum + i.eventQty, 0);
  console.log(`Total excess reservation qty from issues: ${excessQty}`);

  if (!FIX) {
    console.log("\nRe-run with --fix to cancel stale/duplicate reservation events.");
    return;
  }

  console.log("\nApplying fixes...");
  for (const issue of issues) {
    const r = issue.reservation;
    if (issue.reason === "OVER_RESERVED" && issue.piRemainingQty > 0) {
      console.log(`  Updating event ${r.id} qty from ${issue.eventQty} to ${issue.piRemainingQty}`);
      await prisma.inventoryEvent.update({
        where: { id: r.id },
        data: { quantity: issue.piRemainingQty },
      });
    } else {
      console.log(`  Cancelling event ${r.id} (${issue.reason})`);
      await prisma.inventoryEvent.update({
        where: { id: r.id },
        data: {
          status: InventoryEventStatus.CANCELLED,
          cancellationReason: `Auto-reconciled: ${issue.reason}`,
          cancelledAt: new Date(),
        },
      });
    }
  }
  console.log("\n✓ Fixes applied.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
