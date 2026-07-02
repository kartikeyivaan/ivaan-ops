import { PricingType, type PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";

export const QUOTATION_VALIDITY_DAYS = 3;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function isProductPriceEffectiveOn(
  price: { effectiveFrom: Date; effectiveTo: Date | null },
  asOf: Date,
): boolean {
  const asOfDay = toDateOnly(asOf);
  const nextDay = addDays(asOfDay, 1);
  return (
    price.effectiveFrom < nextDay &&
    (price.effectiveTo === null || price.effectiveTo >= asOfDay)
  );
}

export function calculateLineAmounts(input: {
  pricingType: PricingType;
  capacity: number;
  qty: number;
  rate: number;
  gstRate: number;
}) {
  const subtotal =
    input.pricingType === PricingType.WP
      ? input.qty * input.capacity * input.rate
      : input.qty * input.rate;
  const gstAmount = subtotal * (input.gstRate / 100);
  const lineTotal = subtotal + gstAmount;

  return {
    subtotal: roundMoney(subtotal),
    gstAmount: roundMoney(gstAmount),
    lineTotal: roundMoney(lineTotal),
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatRevisionQuotationNo(baseNo: string, revisionNo: number): string {
  if (revisionNo <= 1) return baseNo;
  return `${baseNo}-R${revisionNo}`;
}

export async function generateQuotationNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "QUOTATION";

  const existing = await prisma.documentSequence.findUnique({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
  });

  const nextSeq = (existing?.lastSequence ?? 0) + 1;

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
    create: {
      companyId,
      documentType: docType,
      financialYear: fy,
      lastSequence: nextSeq,
    },
    update: { lastSequence: nextSeq },
  });

  return `${companyCode}-QT-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export function formatQuotationStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export type QuotationLineSnapshot = {
  productId: string;
  productName: string;
  qty: number;
  rate: number;
  lineTotal: number;
};

export type QuotationFieldChange = {
  field: "qty" | "rate" | "lineTotal";
  from: number;
  to: number;
};

export type QuotationLineChange = {
  productId: string;
  productName: string;
  type: "ADDED" | "REMOVED" | "MODIFIED";
  fields: QuotationFieldChange[];
};

/**
 * Compares two sets of quotation lines (previous vs. next revision) and returns a
 * per-product change summary. Lines are keyed by productId; if a product appears on
 * multiple lines its quantities/totals are aggregated for the comparison.
 */
export function diffQuotationLines(
  previous: QuotationLineSnapshot[],
  next: QuotationLineSnapshot[],
): QuotationLineChange[] {
  const aggregate = (lines: QuotationLineSnapshot[]) => {
    const map = new Map<string, QuotationLineSnapshot>();
    for (const line of lines) {
      const existing = map.get(line.productId);
      if (existing) {
        existing.qty += line.qty;
        existing.lineTotal = roundMoney(existing.lineTotal + line.lineTotal);
        existing.rate = line.rate;
      } else {
        map.set(line.productId, { ...line });
      }
    }
    return map;
  };

  const prevMap = aggregate(previous);
  const nextMap = aggregate(next);
  const changes: QuotationLineChange[] = [];

  for (const [productId, nextLine] of nextMap) {
    const prevLine = prevMap.get(productId);
    if (!prevLine) {
      changes.push({
        productId,
        productName: nextLine.productName,
        type: "ADDED",
        fields: [
          { field: "qty", from: 0, to: nextLine.qty },
          { field: "rate", from: 0, to: nextLine.rate },
          { field: "lineTotal", from: 0, to: nextLine.lineTotal },
        ],
      });
      continue;
    }

    const fields: QuotationFieldChange[] = [];
    if (prevLine.qty !== nextLine.qty) {
      fields.push({ field: "qty", from: prevLine.qty, to: nextLine.qty });
    }
    if (prevLine.rate !== nextLine.rate) {
      fields.push({ field: "rate", from: prevLine.rate, to: nextLine.rate });
    }
    if (prevLine.lineTotal !== nextLine.lineTotal) {
      fields.push({ field: "lineTotal", from: prevLine.lineTotal, to: nextLine.lineTotal });
    }
    if (fields.length > 0) {
      changes.push({
        productId,
        productName: nextLine.productName,
        type: "MODIFIED",
        fields,
      });
    }
  }

  for (const [productId, prevLine] of prevMap) {
    if (!nextMap.has(productId)) {
      changes.push({
        productId,
        productName: prevLine.productName,
        type: "REMOVED",
        fields: [
          { field: "qty", from: prevLine.qty, to: 0 },
          { field: "rate", from: prevLine.rate, to: 0 },
          { field: "lineTotal", from: prevLine.lineTotal, to: 0 },
        ],
      });
    }
  }

  return changes;
}
