import { ProjectMaterialLineSource, type PrismaClient } from "@prisma/client";
import { loadApprovalProductInfoMap } from "@/lib/approval-product-info";
import { formatPiEditApprovalQty } from "@/lib/pi-edit-approval-reason";
import type { ProjectMaterialApprovalPayload } from "@/lib/project-material-service";
import {
  formatShortProductNameForApproval,
  type QuotationApprovalProductInfo,
} from "@/lib/quotation-approval-reason";

export function parseProjectMaterialApprovalPayload(
  remarks: string | null | undefined,
): ProjectMaterialApprovalPayload | null {
  if (!remarks?.trim()) return null;
  try {
    const payload = JSON.parse(remarks) as ProjectMaterialApprovalPayload;
    if (!payload || !Array.isArray(payload.lines)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function formatProjectMaterialLineReasons(
  payload: ProjectMaterialApprovalPayload,
  products: Map<string, QuotationApprovalProductInfo>,
): string {
  const parts = payload.lines.map((line) => {
    const product = products.get(line.productId);
    const name = product
      ? formatShortProductNameForApproval(product)
      : line.productName;

    if (
      line.source === ProjectMaterialLineSource.ADDED ||
      line.previousQty == null
    ) {
      return `Added ${name}, qty ${formatPiEditApprovalQty(line.requiredQty)}`;
    }
    if (line.previousQty === line.requiredQty) {
      return `Updated ${name}, qty ${formatPiEditApprovalQty(line.requiredQty)}`;
    }
    return `Qty change - ${name}, ${formatPiEditApprovalQty(line.previousQty)} to ${formatPiEditApprovalQty(line.requiredQty)}`;
  });

  if (parts.length === 0) return "Project material assignment";
  return parts.join("; ");
}

export async function buildProjectMaterialReasonFromRemarks(
  prisma: PrismaClient,
  remarks: string | null | undefined,
): Promise<string> {
  const payload = parseProjectMaterialApprovalPayload(remarks);
  if (!payload) return "Project material assignment";

  const productMap = await loadApprovalProductInfoMap(
    prisma,
    payload.lines.map((line) => line.productId),
  );
  return formatProjectMaterialLineReasons(payload, productMap);
}
