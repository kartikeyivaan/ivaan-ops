import type { PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { formatPiEditApprovalQty } from "@/lib/pi-edit-approval-reason";

export function formatOpeningStockApprovalReason(input: {
  lineCount: number;
  totalPhysicalQty: number;
}): string {
  return `${input.lineCount} product line${input.lineCount === 1 ? "" : "s"}, ${formatPiEditApprovalQty(input.totalPhysicalQty)} total qty`;
}

export async function buildOpeningStockApprovalReasonMap(
  prisma: PrismaClient,
  auditIds: string[],
): Promise<Map<string, string>> {
  if (auditIds.length === 0) return new Map();

  const audits = await prisma.inventoryOpeningAudit.findMany({
    where: { id: { in: auditIds } },
    include: {
      lines: { select: { physicalQty: true } },
    },
  });

  const result = new Map<string, string>();
  for (const audit of audits) {
    const totalPhysicalQty = audit.lines.reduce(
      (sum, line) => sum + decimalToNumber(line.physicalQty),
      0,
    );
    result.set(
      audit.id,
      formatOpeningStockApprovalReason({
        lineCount: audit.lines.length,
        totalPhysicalQty,
      }),
    );
  }

  return result;
}
