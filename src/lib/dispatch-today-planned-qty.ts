import type { Prisma } from "@prisma/client";
import { getRemainingQty } from "@/lib/dispatches";
import { decimalToNumber } from "@/lib/inventory";
import { type KitBomComponent, resolveKitDispatchQty } from "@/lib/kit-fulfillment";
import { isKitCategory } from "@/lib/products";

export type DispatchTodayPlannedLineInput = {
  proformaInvoiceItemId: string;
  plannedQty: number;
};

type PiItemForPlannedQty = {
  id: string;
  productId: string;
  qty: { toNumber(): number } | number | string;
  dispatchedQty: { toNumber(): number } | number | string;
  dispatchTodayPlannedQty?: { toNumber(): number } | number | string | null;
};

type PiItemForPlannedCap = PiItemForPlannedQty & {
  product: { category: { name: string } };
};

export function resolveDispatchTodayPlannedQtyMap(
  items: PiItemForPlannedQty[],
  lines?: DispatchTodayPlannedLineInput[],
): Map<string, number> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result = new Map<string, number>();

  if (lines?.length) {
    for (const line of lines) {
      const item = byId.get(line.proformaInvoiceItemId);
      if (!item) throw new Error("INVALID_PLANNED_LINE");
      const remaining = getRemainingQty(
        decimalToNumber(item.qty),
        decimalToNumber(item.dispatchedQty),
      );
      const planned = line.plannedQty;
      if (!Number.isFinite(planned) || planned < 0 || planned > remaining) {
        throw new Error("INVALID_PLANNED_QTY");
      }
      result.set(item.id, planned);
    }
    for (const item of items) {
      const remaining = getRemainingQty(
        decimalToNumber(item.qty),
        decimalToNumber(item.dispatchedQty),
      );
      if (remaining > 0 && !result.has(item.id)) {
        result.set(item.id, remaining);
      }
    }
    return result;
  }

  for (const item of items) {
    const remaining = getRemainingQty(
      decimalToNumber(item.qty),
      decimalToNumber(item.dispatchedQty),
    );
    if (remaining <= 0) continue;
    const stored = item.dispatchTodayPlannedQty;
    const planned =
      stored == null ? remaining : decimalToNumber(stored);
    if (planned < 0 || planned > remaining) {
      throw new Error("INVALID_PLANNED_QTY");
    }
    result.set(item.id, planned);
  }
  return result;
}

export function assertDispatchTodayPlannedQtyTotal(
  plannedByItem: Map<string, number>,
  options: { requirePositiveTotal: boolean },
) {
  const total = [...plannedByItem.values()].reduce((sum, qty) => sum + qty, 0);
  if (options.requirePositiveTotal && total <= 0) {
    throw new Error("DISPATCH_TODAY_QTY_REQUIRED");
  }
}

export async function persistDispatchTodayPlannedQty(
  tx: Prisma.TransactionClient,
  piId: string,
  plannedByItem: Map<string, number>,
) {
  for (const [itemId, plannedQty] of plannedByItem) {
    await tx.proformaInvoiceItem.update({
      where: { id: itemId, piId },
      data: { dispatchTodayPlannedQty: plannedQty },
    });
  }
}

export async function clearDispatchTodayPlannedQtyForPi(
  tx: Prisma.TransactionClient,
  piId: string,
) {
  await tx.proformaInvoiceItem.updateMany({
    where: { piId },
    data: { dispatchTodayPlannedQty: null },
  });
}

/** Max dispatch qty for a warehouse form row (component row for kits). */
export function maxDispatchQtyForFormRow(input: {
  remainingQty: number;
  kitBomQty: number | null;
  piItemPlannedKitQty: number | null;
  usesPlannedCap: boolean;
}): number {
  if (!input.usesPlannedCap || input.piItemPlannedKitQty == null) {
    return input.remainingQty;
  }
  if (input.kitBomQty != null && input.kitBomQty > 0) {
    return Math.min(input.remainingQty, input.piItemPlannedKitQty * input.kitBomQty);
  }
  return Math.min(input.remainingQty, input.piItemPlannedKitQty);
}

export function piUsesDispatchTodayPlannedCap(
  items: Array<{ dispatchTodayPlannedQty?: { toNumber(): number } | number | string | null }>,
): boolean {
  return items.some((item) => item.dispatchTodayPlannedQty != null);
}

export function assertLineWithinPlannedCap(input: {
  piItem: PiItemForPlannedCap;
  lineQty: number;
  kitBomMap?: ReadonlyMap<string, KitBomComponent[]>;
  groupLines?: Array<{ productId: string; qty: number }>;
}) {
  const plannedRaw = input.piItem.dispatchTodayPlannedQty;
  if (plannedRaw == null) return;

  const planned = decimalToNumber(plannedRaw);

  if (isKitCategory(input.piItem.product.category.name)) {
    const bom = input.kitBomMap?.get(input.piItem.productId) ?? [];
    if (!input.groupLines?.length) throw new Error("INVALID_LINE");
    const kitQty = resolveKitDispatchQty({
      kitOrderedQty: decimalToNumber(input.piItem.qty),
      kitDispatchedQty: decimalToNumber(input.piItem.dispatchedQty),
      bom,
      lines: input.groupLines,
    });
    if (kitQty > planned) throw new Error("EXCEEDS_PLANNED_DISPATCH_QTY");
    return;
  }

  if (input.lineQty > planned) throw new Error("EXCEEDS_PLANNED_DISPATCH_QTY");
}
