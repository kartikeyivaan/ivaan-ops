import { PricingType, type Prisma, type PrismaClient } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { loadApprovalProductInfoMap } from "@/lib/approval-product-info";
import {
  formatQuotationApprovalRate,
  formatShortProductNameForApproval,
  type QuotationApprovalProductInfo,
} from "@/lib/quotation-approval-reason";

export type PiEditLineSnapshot = {
  productId: string;
  qty: number;
  rate: number;
};

export function parseProposedPiEditLines(value: Prisma.JsonValue): PiEditLineSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.productId !== "string") return [];
    return [
      {
        productId: row.productId,
        qty: Number(row.qty) || 0,
        rate: Number(row.rate) || 0,
      },
    ];
  });
}

function formatCompactCapacity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

export function formatPiEditApprovalQty(qty: number): string {
  if (Number.isInteger(qty) || Math.abs(qty - Math.round(qty)) < 0.001) {
    return String(Math.round(qty));
  }
  return formatCompactCapacity(qty);
}

function ratesEqual(a: number, b: number, pricingType: PricingType): boolean {
  if (pricingType === PricingType.WP) {
    return a.toFixed(2) === b.toFixed(2);
  }
  return Math.round(a) === Math.round(b);
}

function qtyEqual(a: number, b: number): boolean {
  return formatPiEditApprovalQty(a) === formatPiEditApprovalQty(b);
}

function shortName(
  productId: string,
  products: Map<string, QuotationApprovalProductInfo>,
): string {
  const product = products.get(productId);
  return product ? formatShortProductNameForApproval(product) : "Product";
}

export function formatPiEditChangeReasons(
  currentLines: PiEditLineSnapshot[],
  proposedLines: PiEditLineSnapshot[],
  products: Map<string, QuotationApprovalProductInfo>,
): string {
  const changes: string[] = [];
  const maxLen = Math.max(currentLines.length, proposedLines.length);

  for (let index = 0; index < maxLen; index += 1) {
    const current = currentLines[index];
    const proposed = proposedLines[index];

    if (current && proposed) {
      if (current.productId !== proposed.productId) {
        changes.push(
          `Product change - ${shortName(current.productId, products)} to ${shortName(proposed.productId, products)}`,
        );
        continue;
      }

      const product = products.get(current.productId);
      const name = shortName(current.productId, products);
      const pricingType = product?.pricingType ?? PricingType.UNIT;

      if (!ratesEqual(current.rate, proposed.rate, pricingType)) {
        changes.push(
          `Rate change - ${name}, ${formatQuotationApprovalRate(current.rate, pricingType)} to ${formatQuotationApprovalRate(proposed.rate, pricingType)}`,
        );
      }
      if (!qtyEqual(current.qty, proposed.qty)) {
        changes.push(
          `Qty change - ${name}, ${formatPiEditApprovalQty(current.qty)} to ${formatPiEditApprovalQty(proposed.qty)}`,
        );
      }
    } else if (current) {
      changes.push(
        `Line removed - ${shortName(current.productId, products)}, qty ${formatPiEditApprovalQty(current.qty)}`,
      );
    } else if (proposed) {
      changes.push(
        `Line added - ${shortName(proposed.productId, products)}, qty ${formatPiEditApprovalQty(proposed.qty)}`,
      );
    }
  }

  if (changes.length === 0) return "Proforma invoice edit";
  return changes.join("; ");
}

export async function buildPiEditApprovalReasonMap(
  prisma: PrismaClient,
  editRequestIds: string[],
): Promise<Map<string, string>> {
  if (editRequestIds.length === 0) return new Map();

  const rows = await prisma.proformaInvoiceEditRequest.findMany({
    where: { id: { in: editRequestIds } },
    include: {
      proformaInvoice: {
        include: {
          items: {
            orderBy: { id: "asc" },
            select: { productId: true, qty: true, rate: true },
          },
        },
      },
    },
  });

  const productIds = new Set<string>();
  for (const row of rows) {
    for (const item of row.proformaInvoice.items) {
      productIds.add(item.productId);
    }
    for (const line of parseProposedPiEditLines(row.proposedLines)) {
      productIds.add(line.productId);
    }
  }

  const productMap = await loadApprovalProductInfoMap(prisma, [...productIds]);

  const result = new Map<string, string>();
  for (const row of rows) {
    const currentLines: PiEditLineSnapshot[] = row.proformaInvoice.items.map((item) => ({
      productId: item.productId,
      qty: decimalToNumber(item.qty),
      rate: decimalToNumber(item.rate),
    }));
    const proposedLines = parseProposedPiEditLines(row.proposedLines);
    result.set(
      row.id,
      formatPiEditChangeReasons(currentLines, proposedLines, productMap),
    );
  }

  return result;
}
