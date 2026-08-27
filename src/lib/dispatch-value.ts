import { PricingType, type Prisma, type PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import {
  loadKitBomMap,
  type KitBomComponent,
  resolveKitDispatchQty,
} from "@/lib/kit-fulfillment";
import { isKitCategory } from "@/lib/products";
import { calculateLineSubtotal } from "@/lib/quotations";

export type DispatchCommercialValueLine = {
  productId: string;
  qty: Prisma.Decimal | number | string;
  product: {
    pricingType: PricingType;
    capacity: Prisma.Decimal | number | string;
  };
  proformaInvoiceItem: {
    id: string;
    rate: Prisma.Decimal | number | string;
    gstRate: Prisma.Decimal | number | string;
    product: {
      id: string;
      pricingType: PricingType;
      capacity: Prisma.Decimal | number | string;
      category: { name: string };
    };
  };
};

function aggregateQtyByProduct(
  lines: Array<{ productId: string; qty: number }>,
): Array<{ productId: string; qty: number }> {
  const byProduct = new Map<string, number>();
  for (const line of lines) {
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.qty);
  }
  return [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/** Kit qty represented by component dispatch lines (no remaining-qty ceiling). */
export function kitQtyFromComponentLines(
  bom: KitBomComponent[],
  lines: Array<{ productId: string; qty: number }>,
): number {
  if (bom.length === 0) return 0;
  return resolveKitDispatchQty({
    kitOrderedQty: Number.MAX_SAFE_INTEGER,
    kitDispatchedQty: 0,
    bom,
    lines: aggregateQtyByProduct(lines),
  });
}

/**
 * Commercial value per dispatch line.
 *
 * Kit PI items are priced as UNIT kits, but warehouse lines are exploded BOM
 * components (often WP modules). Valuing those with component capacity × kit
 * rate inflates totals by ~500–600×. Kits are valued once as
 * kitQty × kitRate × GST, then split evenly across the group's lines so
 * line-level reports still sum to the commercial total.
 */
export function commercialValuesByDispatchLine(
  lines: ReadonlyArray<DispatchCommercialValueLine>,
  kitBomMap: ReadonlyMap<string, KitBomComponent[]> = new Map(),
): number[] {
  const values = lines.map(() => 0);
  const groups = new Map<string, number[]>();

  for (let index = 0; index < lines.length; index += 1) {
    const piItemId = lines[index]!.proformaInvoiceItem.id;
    const group = groups.get(piItemId) ?? [];
    group.push(index);
    groups.set(piItemId, group);
  }

  for (const indices of groups.values()) {
    const sample = lines[indices[0]!]!;
    const piProduct = sample.proformaInvoiceItem.product;
    const rate = decimalToNumber(sample.proformaInvoiceItem.rate);
    const gstRate = decimalToNumber(sample.proformaInvoiceItem.gstRate);
    const withGst = (subtotal: number) => subtotal * (1 + gstRate / 100);

    if (isKitCategory(piProduct.category.name)) {
      const bom = kitBomMap.get(piProduct.id) ?? [];
      const kitLines = indices.map((index) => ({
        productId: lines[index]!.productId,
        qty: decimalToNumber(lines[index]!.qty),
      }));
      let kitQty = 0;
      try {
        kitQty = kitQtyFromComponentLines(bom, kitLines);
      } catch {
        // Incomplete/corrupt historical kit lines: skip rather than explode value.
        kitQty = 0;
      }
      const total = withGst(kitQty * rate);
      const share = indices.length > 0 ? total / indices.length : 0;
      for (const index of indices) values[index] = share;
      continue;
    }

    for (const index of indices) {
      const line = lines[index]!;
      const subtotal = calculateLineSubtotal({
        pricingType: line.product.pricingType,
        capacity: decimalToNumber(line.product.capacity),
        qty: decimalToNumber(line.qty),
        rate,
      });
      values[index] = withGst(subtotal);
    }
  }

  return values;
}

/** Commercial subtotal (ex-GST) per dispatch line — mirrors {@link commercialValuesByDispatchLine} without GST. */
export function commercialSubtotalsExGstByDispatchLine(
  lines: ReadonlyArray<DispatchCommercialValueLine>,
  kitBomMap: ReadonlyMap<string, KitBomComponent[]> = new Map(),
): number[] {
  const values = lines.map(() => 0);
  const groups = new Map<string, number[]>();

  for (let index = 0; index < lines.length; index += 1) {
    const piItemId = lines[index]!.proformaInvoiceItem.id;
    const group = groups.get(piItemId) ?? [];
    group.push(index);
    groups.set(piItemId, group);
  }

  for (const indices of groups.values()) {
    const sample = lines[indices[0]!]!;
    const piProduct = sample.proformaInvoiceItem.product;
    const rate = decimalToNumber(sample.proformaInvoiceItem.rate);

    if (isKitCategory(piProduct.category.name)) {
      const bom = kitBomMap.get(piProduct.id) ?? [];
      const kitLines = indices.map((index) => ({
        productId: lines[index]!.productId,
        qty: decimalToNumber(lines[index]!.qty),
      }));
      let kitQty = 0;
      try {
        kitQty = kitQtyFromComponentLines(bom, kitLines);
      } catch {
        kitQty = 0;
      }
      const total = kitQty * rate;
      const share = indices.length > 0 ? total / indices.length : 0;
      for (const index of indices) values[index] = share;
      continue;
    }

    for (const index of indices) {
      const line = lines[index]!;
      values[index] = calculateLineSubtotal({
        pricingType: line.product.pricingType,
        capacity: decimalToNumber(line.product.capacity),
        qty: decimalToNumber(line.qty),
        rate,
      });
    }
  }

  return values;
}

export function sumCommercialValueFromDispatchLines(
  lines: ReadonlyArray<DispatchCommercialValueLine>,
  kitBomMap: ReadonlyMap<string, KitBomComponent[]> = new Map(),
): number {
  return commercialValuesByDispatchLine(lines, kitBomMap).reduce(
    (sum, value) => sum + value,
    0,
  );
}

export function collectKitProductIdsFromDispatchLines(
  dispatches: ReadonlyArray<{
    lines: ReadonlyArray<{
      proformaInvoiceItem: { product: { id: string; category: { name: string } } };
    }>;
  }>,
): string[] {
  const ids = new Set<string>();
  for (const dispatch of dispatches) {
    for (const line of dispatch.lines) {
      if (isKitCategory(line.proformaInvoiceItem.product.category.name)) {
        ids.add(line.proformaInvoiceItem.product.id);
      }
    }
  }
  return [...ids];
}

export async function loadKitBomMapForDispatches(
  prisma: PrismaClient | Prisma.TransactionClient,
  dispatches: ReadonlyArray<{
    lines: ReadonlyArray<{
      proformaInvoiceItem: { product: { id: string; category: { name: string } } };
    }>;
  }>,
): Promise<Map<string, KitBomComponent[]>> {
  return loadKitBomMap(prisma, collectKitProductIdsFromDispatchLines(dispatches));
}
