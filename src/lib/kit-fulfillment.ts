import type { Prisma, PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { isKitCategory } from "@/lib/products";
import { getKitComponentsForFulfillment } from "@/lib/product-service";

export type FulfillmentLine = {
  productId: string;
  qty: number;
  serialTracking: boolean;
  displayName: string;
  /** Present when this line comes from exploding a kit PI/quote item. */
  sourceKitProductId?: string;
  componentBomQty?: number;
};

export type KitBomComponent = {
  componentProductId: string;
  qty: number;
  displayName: string;
  serialTracking: boolean;
  categoryName: string;
};

/**
 * Expand commercial lines into warehouse fulfillment lines.
 * Kits explode to BOM × kit qty; other products pass through.
 */
export async function explodeItemsForFulfillment(
  prisma: PrismaClient | Prisma.TransactionClient,
  items: Array<{
    productId: string;
    qty: number;
    serialTracking: boolean;
    displayName: string;
    categoryName: string;
  }>,
): Promise<FulfillmentLine[]> {
  const exploded: FulfillmentLine[] = [];

  for (const item of items) {
    if (!isKitCategory(item.categoryName)) {
      exploded.push({
        productId: item.productId,
        qty: item.qty,
        serialTracking: item.serialTracking,
        displayName: item.displayName,
      });
      continue;
    }

    const components = await getKitComponentsForFulfillment(prisma, item.productId);
    if (components.length === 0) {
      throw new Error(`KIT_BOM_EMPTY|${item.displayName}`);
    }

    for (const component of components) {
      exploded.push({
        productId: component.componentProductId,
        qty: item.qty * component.qty,
        serialTracking: component.serialTracking,
        displayName: component.displayName,
        sourceKitProductId: item.productId,
        componentBomQty: component.qty,
      });
    }
  }

  return exploded;
}

/** Merge duplicate product lines after explode (same component on multiple kits). */
export function mergeFulfillmentQuantities(
  lines: FulfillmentLine[],
): Map<string, { qty: number; serialTracking: boolean; displayName: string }> {
  const merged = new Map<
    string,
    { qty: number; serialTracking: boolean; displayName: string }
  >();
  for (const line of lines) {
    const existing = merged.get(line.productId);
    if (existing) {
      existing.qty += line.qty;
    } else {
      merged.set(line.productId, {
        qty: line.qty,
        serialTracking: line.serialTracking,
        displayName: line.displayName,
      });
    }
  }
  return merged;
}

export async function loadKitBomMap(
  prisma: PrismaClient | Prisma.TransactionClient,
  kitProductIds: string[],
): Promise<Map<string, KitBomComponent[]>> {
  const uniqueIds = [...new Set(kitProductIds)];
  const map = new Map<string, KitBomComponent[]>();
  for (const kitProductId of uniqueIds) {
    map.set(kitProductId, await getKitComponentsForFulfillment(prisma, kitProductId));
  }
  return map;
}

/**
 * Given dispatch lines for one kit PI item, resolve how many kits are being
 * dispatched. All BOM components must be present with proportional quantities.
 */
export function resolveKitDispatchQty(input: {
  kitOrderedQty: number;
  kitDispatchedQty: number;
  bom: KitBomComponent[];
  lines: Array<{ productId: string; qty: number }>;
}): number {
  const remainingKits = Math.max(0, input.kitOrderedQty - input.kitDispatchedQty);
  if (input.bom.length === 0) throw new Error("KIT_BOM_EMPTY");

  const byProduct = new Map(input.lines.map((line) => [line.productId, line.qty]));
  let kitQty: number | null = null;

  for (const component of input.bom) {
    const lineQty = byProduct.get(component.componentProductId);
    if (lineQty == null) throw new Error("KIT_COMPONENT_MISSING");
    if (component.qty <= 0) throw new Error("KIT_BOM_EMPTY");

    const ratio = lineQty / component.qty;
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("INVALID_QUANTITY");

    // Allow small float noise; require whole kits for serial-heavy BOMs.
    const rounded = Math.round(ratio * 1000) / 1000;
    if (Math.abs(rounded - ratio) > 0.001) throw new Error("KIT_QTY_MISMATCH");
    if (kitQty == null) kitQty = rounded;
    else if (Math.abs(kitQty - rounded) > 0.001) throw new Error("KIT_QTY_MISMATCH");
  }

  // Extra non-BOM products on the kit PI item are not allowed.
  for (const line of input.lines) {
    if (!input.bom.some((component) => component.componentProductId === line.productId)) {
      throw new Error("INVALID_LINE");
    }
  }

  if (kitQty == null || kitQty <= 0) throw new Error("INVALID_QUANTITY");
  if (kitQty > remainingKits) throw new Error("EXCEEDS_REMAINING_QTY");
  return kitQty;
}

export function componentRemainingQty(
  remainingKits: number,
  bomQty: number,
): number {
  return remainingKits * bomQty;
}

export function isKitProduct(product: {
  category?: { name: string } | null;
  categoryName?: string;
}): boolean {
  const name = product.category?.name ?? product.categoryName ?? "";
  return isKitCategory(name);
}

export function decimalKitQty(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : decimalToNumber(value);
}
