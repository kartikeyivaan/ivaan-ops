import {
  SerialStatus,
  TransferStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { normalizeSerialNumber } from "@/lib/inventory";

export type SerialDb = PrismaClient | Prisma.TransactionClient;

/** Statuses that mean the unit is still physically (or reserved) in the system. */
export const LIVE_SERIAL_STATUSES: SerialStatus[] = [
  SerialStatus.AVAILABLE,
  SerialStatus.BOOKED,
  SerialStatus.DAMAGED,
  SerialStatus.DAMAGE_PENDING,
];

export const OPEN_TRANSFER_STATUSES: TransferStatus[] = [
  TransferStatus.DISPATCHED,
  TransferStatus.PARTIALLY_RECEIVED,
];

export type SerialOccupancyKind = "new" | "reentry" | "live" | "in_transit";

export type SerialOccupancy = {
  serialNumber: string;
  kind: SerialOccupancyKind;
  liveStatus?: SerialStatus;
  lastProductId?: string;
  lastProductName?: string;
  lastCycleId?: string;
  reason: string;
};

export function isLiveSerialStatus(status: SerialStatus): boolean {
  return LIVE_SERIAL_STATUSES.includes(status);
}

export function describeLiveSerialBlock(status: SerialStatus): string {
  switch (status) {
    case SerialStatus.AVAILABLE:
      return "Already in stock.";
    case SerialStatus.BOOKED:
      return "Booked against a sales order.";
    case SerialStatus.DAMAGED:
      return "Marked damaged and still in the warehouse.";
    case SerialStatus.DAMAGE_PENDING:
      return "A damage report is pending approval for this serial.";
    default:
      return `Not available (status ${status}).`;
  }
}

export function classifyLoadedSerials(input: {
  serialNumbers: string[];
  rows: Array<{
    id: string;
    serialNumber: string;
    status: SerialStatus;
    createdAt: Date;
    productId: string;
    productName: string;
  }>;
  inTransitSerialNumbers: Iterable<string>;
}): SerialOccupancy[] {
  const inTransit = new Set(
    Array.from(input.inTransitSerialNumbers, (value) => normalizeSerialNumber(value)),
  );
  const byNumber = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const key = normalizeSerialNumber(row.serialNumber);
    const list = byNumber.get(key) ?? [];
    list.push(row);
    byNumber.set(key, list);
  }

  return input.serialNumbers.map((raw) => {
    const serialNumber = normalizeSerialNumber(raw);
    const cycles = (byNumber.get(serialNumber) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latest = cycles[cycles.length - 1];
    const live = [...cycles].reverse().find((row) => isLiveSerialStatus(row.status));

    if (live) {
      return {
        serialNumber,
        kind: "live" as const,
        liveStatus: live.status,
        lastProductId: live.productId,
        lastProductName: live.productName,
        lastCycleId: live.id,
        reason: describeLiveSerialBlock(live.status),
      };
    }

    if (inTransit.has(serialNumber)) {
      return {
        serialNumber,
        kind: "in_transit" as const,
        liveStatus: SerialStatus.DISPATCHED,
        lastProductId: latest?.productId,
        lastProductName: latest?.productName,
        lastCycleId: latest?.id,
        reason: "In transit on an open transfer. Receive the transfer first.",
      };
    }

    if (latest) {
      return {
        serialNumber,
        kind: "reentry" as const,
        lastProductId: latest.productId,
        lastProductName: latest.productName,
        lastCycleId: latest.id,
        reason: "Previously exited. Will start a new stock cycle.",
      };
    }

    return {
      serialNumber,
      kind: "new" as const,
      reason: "New serial.",
    };
  });
}

export async function loadSerialOccupancies(
  db: SerialDb,
  serialNumbersInput: string[],
): Promise<SerialOccupancy[]> {
  const serialNumbers = Array.from(
    new Set(serialNumbersInput.map(normalizeSerialNumber).filter(Boolean)),
  );
  if (serialNumbers.length === 0) return [];

  const [rows, inTransitRows] = await Promise.all([
    db.inventorySerial.findMany({
      where: { serialNumber: { in: serialNumbers } },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        createdAt: true,
        productId: true,
        product: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.inventoryTransferLineSerial.findMany({
      where: {
        serial: { serialNumber: { in: serialNumbers } },
        line: {
          transfer: { status: { in: OPEN_TRANSFER_STATUSES } },
        },
      },
      select: { serial: { select: { serialNumber: true } } },
    }),
  ]);

  return classifyLoadedSerials({
    serialNumbers,
    rows: rows.map((row) => ({
      id: row.id,
      serialNumber: row.serialNumber,
      status: row.status,
      createdAt: row.createdAt,
      productId: row.productId,
      productName: row.product.displayName,
    })),
    inTransitSerialNumbers: inTransitRows.map((row) => row.serial.serialNumber),
  });
}

export function occupyingSerialNumbers(occupancies: SerialOccupancy[]): string[] {
  return occupancies
    .filter((row) => row.kind === "live" || row.kind === "in_transit")
    .map((row) => row.serialNumber);
}

export function reentrySerialNumbers(occupancies: SerialOccupancy[]): string[] {
  return occupancies.filter((row) => row.kind === "reentry").map((row) => row.serialNumber);
}

export function productMismatchSerialNumbers(
  occupancies: SerialOccupancy[],
  incomingProductId?: string | null,
): string[] {
  if (!incomingProductId) return [];
  return occupancies
    .filter(
      (row) =>
        row.kind === "reentry" &&
        row.lastProductId &&
        row.lastProductId !== incomingProductId,
    )
    .map((row) => row.serialNumber);
}

export async function assertSerialsClearForNewCycle(
  db: SerialDb,
  input: {
    serialNumbers: string[];
    incomingProductId?: string | null;
    acknowledgeProductMismatch?: boolean;
  },
): Promise<SerialOccupancy[]> {
  const occupancies = await loadSerialOccupancies(db, input.serialNumbers);
  const blocked = occupancies.find((row) => row.kind === "live" || row.kind === "in_transit");
  if (blocked) {
    throw occupancyToError(blocked);
  }

  if (!input.acknowledgeProductMismatch && input.incomingProductId) {
    const mismatch = occupancies.find(
      (row) =>
        row.kind === "reentry" &&
        row.lastProductId &&
        row.lastProductId !== input.incomingProductId,
    );
    if (mismatch) {
      throw new Error(`SERIAL_PRODUCT_MISMATCH_UNCONFIRMED:${mismatch.serialNumber}`);
    }
  }

  return occupancies;
}

export function occupancyToError(occupancy: SerialOccupancy): Error {
  if (occupancy.kind === "in_transit") {
    return new Error(`SERIAL_IN_TRANSIT:${occupancy.serialNumber}`);
  }
  return new Error(`SERIAL_STILL_IN_STOCK:${occupancy.serialNumber}`);
}

export function parsePrefixedSerialError(message: string): {
  code: string;
  serialNumber?: string;
} | null {
  const prefixes = [
    "SERIAL_STILL_IN_STOCK",
    "SERIAL_IN_TRANSIT",
    "SERIAL_PRODUCT_MISMATCH_UNCONFIRMED",
  ] as const;
  for (const code of prefixes) {
    if (message === code) return { code };
    if (message.startsWith(`${code}:`)) {
      return { code, serialNumber: message.slice(code.length + 1) };
    }
  }
  return null;
}

export function humanSerialOccupancyError(message: string): string | null {
  const parsed = parsePrefixedSerialError(message);
  if (!parsed) return null;
  const serial = parsed.serialNumber ? ` ${parsed.serialNumber}` : "";
  if (parsed.code === "SERIAL_IN_TRANSIT") {
    return `Serial${serial} is in transit on an open transfer. Receive the transfer first.`;
  }
  if (parsed.code === "SERIAL_PRODUCT_MISMATCH_UNCONFIRMED") {
    return `Serial${serial} was last received as a different product. Confirm to continue.`;
  }
  return `Serial${serial} is still in stock and cannot be received again.`;
}

/** Prefer a live occupying row; otherwise the latest cycle for this serial number. */
export async function findLiveOrLatestSerial<T extends Prisma.InventorySerialInclude>(
  db: SerialDb,
  serialNumberInput: string,
  include: T,
): Promise<Prisma.InventorySerialGetPayload<{ include: T }> | null> {
  const serialNumber = normalizeSerialNumber(serialNumberInput);
  if (!serialNumber) return null;

  const live = await db.inventorySerial.findFirst({
    where: { serialNumber, status: { in: LIVE_SERIAL_STATUSES } },
    include,
    orderBy: { createdAt: "desc" },
  });
  if (live) {
    return live as Prisma.InventorySerialGetPayload<{ include: T }>;
  }

  const latest = await db.inventorySerial.findFirst({
    where: { serialNumber },
    include,
    orderBy: { createdAt: "desc" },
  });
  return (latest as Prisma.InventorySerialGetPayload<{ include: T }> | null) ?? null;
}
