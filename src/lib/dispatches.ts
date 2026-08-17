import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getFinancialYear } from "@/lib/inventory";

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export async function generateDispatchNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyCode: string,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "DISPATCH";

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

  return `${companyCode}-DC-${fy}-${String(nextSeq).padStart(5, "0")}`;
}

export function formatDispatchStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function getRemainingQty(orderedQty: number, dispatchedQty: number): number {
  return Math.max(0, orderedQty - dispatchedQty);
}

export type PartialDispatchLineInput = {
  productName: string;
  remainingQty: number;
  qty: number | string;
  serialTracking?: boolean;
  serials?: Array<{ id: string }>;
};

/**
 * Dispatch qty for a line. Serial-tracked products always follow accepted serials,
 * so a partial scan cannot keep the leftover booked qty as the submitted quantity.
 */
export function effectiveDispatchQty(line: {
  serialTracking?: boolean;
  serials?: Array<{ id: string }>;
  qty: number | string;
}): number {
  if (line.serialTracking) {
    return line.serials?.length ?? 0;
  }
  const qty = Number(line.qty);
  return Number.isFinite(qty) ? qty : 0;
}

export type PartialDispatchSummaryLine = {
  productName: string;
  dispatchQty: number;
  remainingQty: number;
  /** True when the line is omitted from this dispatch (qty 0). */
  omitted: boolean;
};

/** Lines where dispatch qty is below remaining booked/assigned balance. */
export function describePartialDispatchLines(
  lines: PartialDispatchLineInput[],
): PartialDispatchSummaryLine[] {
  const partial: PartialDispatchSummaryLine[] = [];

  for (const line of lines) {
    const safeDispatchQty = effectiveDispatchQty(line);
    if (line.remainingQty <= 0) continue;

    if (safeDispatchQty <= 0) {
      partial.push({
        productName: line.productName,
        dispatchQty: 0,
        remainingQty: line.remainingQty,
        omitted: true,
      });
      continue;
    }

    if (safeDispatchQty < line.remainingQty) {
      partial.push({
        productName: line.productName,
        dispatchQty: safeDispatchQty,
        remainingQty: line.remainingQty,
        omitted: false,
      });
    }
  }

  return partial;
}

export function isPartialDispatch(lines: PartialDispatchLineInput[]): boolean {
  return describePartialDispatchLines(lines).length > 0;
}

export function formatPartialDispatchConfirmMessage(
  lines: PartialDispatchSummaryLine[],
): string {
  const detail = lines
    .map((line) => {
      if (line.omitted) {
        return `• ${line.productName}: not included (${line.remainingQty} remaining)`;
      }
      const left = line.remainingQty - line.dispatchQty;
      return `• ${line.productName}: ${line.dispatchQty} of ${line.remainingQty} (${left} remaining)`;
    })
    .join("\n");

  return (
    `You are creating a partial dispatch:\n\n${detail}\n\n` +
    "Remaining quantity will stay booked for a future dispatch.\n\n" +
    "Continue with partial dispatch?"
  );
}
