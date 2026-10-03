import type { PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { loadApprovalProductInfoMap } from "@/lib/approval-product-info";
import { formatPiEditApprovalQty } from "@/lib/pi-edit-approval-reason";
import { formatShortProductNameForApproval } from "@/lib/quotation-approval-reason";

export function joinCrossCompanyTransferLineReasons(
  fromCompanyCode: string,
  lineParts: string[],
): string {
  if (lineParts.length === 0) {
    return `Transfer from ${fromCompanyCode}`;
  }
  return `From ${fromCompanyCode}: ${lineParts.join("; ")}`;
}

export async function buildCrossCompanyTransferApprovalReasonMap(
  prisma: PrismaClient,
  planIds: string[],
): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map();

  const plans = await prisma.piCrossCompanyTransferPlan.findMany({
    where: { id: { in: planIds } },
    include: {
      fromCompany: { select: { code: true } },
      lines: {
        select: { productId: true, qty: true },
      },
    },
  });

  const productIds = plans.flatMap((plan) => plan.lines.map((line) => line.productId));
  const productMap = await loadApprovalProductInfoMap(prisma, productIds);

  const result = new Map<string, string>();
  for (const plan of plans) {
    const lineParts = plan.lines.map((line) => {
      const product = productMap.get(line.productId);
      const name = product
        ? formatShortProductNameForApproval(product)
        : "Product";
      return `${name} × ${formatPiEditApprovalQty(decimalToNumber(line.qty))}`;
    });
    result.set(
      plan.id,
      joinCrossCompanyTransferLineReasons(plan.fromCompany.code, lineParts),
    );
  }

  return result;
}
