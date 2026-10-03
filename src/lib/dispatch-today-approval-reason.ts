import type { PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { loadApprovalProductInfoMap } from "@/lib/approval-product-info";
import { formatPiEditApprovalQty } from "@/lib/pi-edit-approval-reason";
import { formatShortProductNameForApproval } from "@/lib/quotation-approval-reason";

export function joinDispatchTodayPlannedLineReasons(lineParts: string[]): string {
  if (lineParts.length === 0) return "Dispatch today approval requested";
  return `Dispatch today: ${lineParts.join("; ")}`;
}

export async function buildDispatchTodayPlannedReasonMap(
  prisma: PrismaClient,
  piIds: string[],
): Promise<Map<string, string>> {
  if (piIds.length === 0) return new Map();

  const pis = await prisma.proformaInvoice.findMany({
    where: { id: { in: piIds } },
    include: {
      items: {
        where: { dispatchTodayPlannedQty: { not: null } },
        select: {
          productId: true,
          dispatchTodayPlannedQty: true,
        },
      },
    },
  });

  const productIds = pis.flatMap((pi) => pi.items.map((item) => item.productId));
  const productMap = await loadApprovalProductInfoMap(prisma, productIds);

  const result = new Map<string, string>();
  for (const pi of pis) {
    const lineParts = pi.items.flatMap((item) => {
      const qty = item.dispatchTodayPlannedQty
        ? decimalToNumber(item.dispatchTodayPlannedQty)
        : 0;
      if (!(qty > 0)) return [];
      const product = productMap.get(item.productId);
      const name = product
        ? formatShortProductNameForApproval(product)
        : "Product";
      return [`${name} × ${formatPiEditApprovalQty(qty)}`];
    });
    result.set(pi.id, joinDispatchTodayPlannedLineReasons(lineParts));
  }

  return result;
}
