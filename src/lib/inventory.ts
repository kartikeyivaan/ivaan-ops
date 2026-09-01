import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type StockSummary = {
  availableStock: number;
  incomingStock: number;
  bookedStock: number;
  damagedStock: number;
  /** Qty reserved for open projects (Jalgaon Projects committed bucket). */
  committedStock: number;
};

export function emptyStockSummary(): StockSummary {
  return {
    availableStock: 0,
    incomingStock: 0,
    bookedStock: 0,
    damagedStock: 0,
    committedStock: 0,
  };
}

export function getFinancialYear(date = new Date()): string {
  const month = date.getMonth();
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

export function normalizePurchaseInvoiceNo(value: string): string {
  return value.trim().toUpperCase();
}

export function systemPurchaseInvoiceNo(lotNumber: string): string {
  return `SYS-${lotNumber}`;
}

/** Destination lots created by warehouse / cross-company transfers (SYS-LOT-…, not MSE/OSA). */
export function isInternalTransferLot(purchaseInvoiceNo: string): boolean {
  const normalized = normalizePurchaseInvoiceNo(purchaseInvoiceNo);
  if (!normalized.startsWith("SYS-")) return false;
  if (normalized.endsWith("-MSE") || normalized.endsWith("-OSA")) return false;
  return true;
}

export async function generateLotNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const prefix = `LOT-${fy}-`;
  const latest = await prisma.inventoryLot.findFirst({
    where: { lotNumber: { startsWith: prefix } },
    orderBy: { lotNumber: "desc" },
    select: { lotNumber: true },
  });

  const lastSeq = latest
    ? Number.parseInt(latest.lotNumber.slice(prefix.length), 10) || 0
    : 0;

  return `${prefix}${String(lastSeq + 1).padStart(5, "0")}`;
}

export async function generateTransferNumber(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(date);
  const docType = "TRANSFER";
  const prefix = `TRF-${fy}-`;

  const existing = await prisma.documentSequence.findUnique({
    where: {
      companyId_documentType_financialYear: {
        companyId,
        documentType: docType,
        financialYear: fy,
      },
    },
  });

  // transfer_number is globally unique, but sequences are per-company. Without
  // syncing to the highest existing TRF for this FY, the first PCMV transfer
  // would collide with ISE's TRF-26-27-00001 (and vice versa).
  const latest = await prisma.inventoryTransfer.findFirst({
    where: { transferNumber: { startsWith: prefix } },
    orderBy: { transferNumber: "desc" },
    select: { transferNumber: true },
  });
  const latestSeq = latest
    ? Number.parseInt(latest.transferNumber.slice(prefix.length), 10) || 0
    : 0;

  const nextSeq = Math.max(existing?.lastSequence ?? 0, latestSeq) + 1;

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

  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

export function decimalToNumber(value: { toNumber(): number } | number | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

export function calculateTotalPurchaseCost(input: {
  quantity: number;
  unitPurchaseRate: number;
  gstRate?: number;
  transportCharges?: number;
  commissionCharges?: number;
}): number {
  const subtotal = input.quantity * input.unitPurchaseRate;
  const gstAmount = subtotal * ((input.gstRate ?? 0) / 100);
  const transport = input.transportCharges ?? 0;
  const commission = input.commissionCharges ?? 0;
  return Number((subtotal + gstAmount + transport + commission).toFixed(2));
}

export function normalizeSerialNumber(serial: string): string {
  return serial.trim().toUpperCase();
}

/** Scanner paste often includes this noise; ignore it when parsing serials. */
const SERIAL_QR_NOISE = /\[QR\]/gi;

/** Waaree module serials look like WS07269074147109 (WS + 14 digits). */
const WAAREE_PANEL_SERIAL_PATTERN = /^WS\d{14}$/;

export function isWaareeBrand(brandName: string): boolean {
  return brandName.trim().toLowerCase() === "waaree";
}

export function isWaareePanelSerial(serial: string): boolean {
  return WAAREE_PANEL_SERIAL_PATTERN.test(normalizeSerialNumber(serial));
}

/** Max serial numbers allowed in one inward, dispatch lookup, or manual-stock entry. */
export const MAX_SERIALS_PER_ENTRY = 1000;

export function serialsPerEntryLimitMessage(count: number) {
  return `A single entry can include at most ${MAX_SERIALS_PER_ENTRY} serial numbers (you entered ${count}).`;
}

/**
 * Split pasted serial text on any whitespace, commas, or semicolons.
 * Strips `[QR]` scanner noise and empty tokens.
 * Whitespace counts as a separator because single-line inputs collapse pasted
 * newlines into spaces, which would otherwise merge every serial into one token.
 */
export function parseSerialInput(text: string): string[] {
  return text
    .replace(SERIAL_QR_NOISE, " ")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Normalized serials that appear more than once in the list. */
export function findDuplicateSerialKeys(serials: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const serial of serials) {
    const key = normalizeSerialNumber(serial);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

export type InwardSerialCategory = "new" | "repeat" | "invalid";

export type InwardSerialClassification = {
  newSerials: string[];
  repeatSerials: string[];
  invalidSerials: string[];
};

function isInverterCategory(categoryName?: string | null): boolean {
  return Boolean(categoryName && categoryName.trim().toLowerCase() === "inverters");
}

/**
 * Whether a serial matches the expected format for the product brand/category.
 * Waaree modules must be WS + 14 digits. Inverters have no format constraints.
 * Other brands/categories accept any non-empty token.
 */
export function isValidInwardSerialFormat(
  serial: string,
  brandName?: string | null,
  categoryName?: string | null,
): boolean {
  const key = normalizeSerialNumber(serial);
  if (!key) return false;
  if (isInverterCategory(categoryName)) return true;
  if (brandName && isWaareeBrand(brandName)) {
    return isWaareePanelSerial(key);
  }
  return true;
}

/**
 * Classify pasted/scanned inward serials into new, repeat (in-list or already in DB),
 * and invalid format. First occurrence of a valid serial is checked against `existingKeys`;
 * later occurrences of the same value are always treated as repeats.
 */
export function classifyInwardSerials(input: {
  serials: string[];
  existingKeys?: Iterable<string>;
  brandName?: string | null;
  categoryName?: string | null;
}): InwardSerialClassification {
  const existing = new Set(
    Array.from(input.existingKeys ?? [], (value) => normalizeSerialNumber(value)).filter(
      Boolean,
    ),
  );
  const seen = new Set<string>();
  const newSerials: string[] = [];
  const repeatSerials: string[] = [];
  const invalidSerials: string[] = [];

  for (const serial of input.serials) {
    const key = normalizeSerialNumber(serial);
    if (!key) continue;

    if (!isValidInwardSerialFormat(key, input.brandName, input.categoryName)) {
      if (!invalidSerials.includes(key)) invalidSerials.push(key);
      continue;
    }

    if (seen.has(key) || existing.has(key)) {
      if (!repeatSerials.includes(key)) repeatSerials.push(key);
      seen.add(key);
      continue;
    }

    seen.add(key);
    newSerials.push(key);
  }

  return { newSerials, repeatSerials, invalidSerials };
}

export function pendingIncomingQuantity(input: {
  quantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
}): number {
  return Math.max(
    0,
    input.quantity - input.receivedQuantity - input.damagedQuantity,
  );
}

export function validateInwardQuantities(input: {
  quantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  receivedQty: number;
  damagedQty: number;
}): string | null {
  const pending = pendingIncomingQuantity(input);
  const totalIncoming = input.receivedQty + input.damagedQty;

  if (input.receivedQty < 0 || input.damagedQty < 0) {
    return "Quantities cannot be negative.";
  }

  if (totalIncoming <= 0) {
    return "Enter a received or damaged quantity.";
  }

  if (totalIncoming > pending) {
    return "Received and damaged quantities exceed pending incoming stock.";
  }

  return null;
}
