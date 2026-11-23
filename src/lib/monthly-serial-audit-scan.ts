import {
  MonthlyAuditScanResult,
  MonthlyAuditStatus,
  MonthlyAuditScanSource,
  type PrismaClient,
} from "@prisma/client";

import { normalizeSerialNumber, parseSerialInput } from "@/lib/inventory";
import { monthlyAuditExcludedCompanyFilter } from "@/lib/monthly-serial-audit-scope";

/**
 * Scanning for the monthly serial audit (Phase 3).
 *
 * Each serial is recorded once per run, for the whole company-wide run.
 * - FOUND: serial is in the snapshot and has not been scanned yet.
 * - ADDITIONAL: serial is not in the snapshot (recorded, goes to findings).
 * - ALREADY_SCANNED: someone already scanned this serial in this run.
 *   Not stored again; reported back to the scanner only.
 *
 * Concurrency: the run row is locked (SELECT ... FOR UPDATE) for the whole
 * batch, so two auditors scanning at the same time are serialised and the
 * second one sees the first one's scan.
 */

export const MAX_SCANS_PER_REQUEST = 5000;

export type ScanOutcome = "FOUND" | "ADDITIONAL" | "ALREADY_SCANNED";

export type ScanItemResult = {
  serialNumber: string;
  outcome: ScanOutcome;
  matchedSerialId: string | null;
};

/**
 * Pure classification of a batch. Inputs are already normalised.
 * - `alreadyScanned`: serial numbers already recorded in this run.
 * - `snapshot`: map of serial number -> snapshot serial id for this run.
 */
export function classifyScanBatch(
  serials: string[],
  alreadyScanned: Set<string>,
  snapshot: Map<string, string>,
): ScanItemResult[] {
  const seenInBatch = new Set<string>();
  return serials.map((serialNumber) => {
    if (alreadyScanned.has(serialNumber) || seenInBatch.has(serialNumber)) {
      return { serialNumber, outcome: "ALREADY_SCANNED", matchedSerialId: null };
    }
    seenInBatch.add(serialNumber);
    const matchedSerialId = snapshot.get(serialNumber) ?? null;
    return {
      serialNumber,
      outcome: matchedSerialId ? "FOUND" : "ADDITIONAL",
      matchedSerialId,
    };
  });
}

/** Splits pasted text or an array into normalised, de-duplicated serials. */
/**
 * Scanner symbology labels such as [CODE 128], [DATA MATRIX] or [QR] are not
 * part of the serial. Remove them before splitting.
 */
const SYMBOLOGY_LABEL = /\[[A-Za-z0-9 _-]{1,20}\]/g;

export function prepareScanInput(input: string | string[]): string[] {
  const text = (Array.isArray(input) ? input.join("\n") : input).replace(SYMBOLOGY_LABEL, "\n");
  const raw = parseSerialInput(text);
  const normalised = raw.map(normalizeSerialNumber).filter(Boolean);
  return [...new Set(normalised)];
}

export async function recordMonthlyAuditScans(
  prisma: PrismaClient,
  input: {
    auditId: string;
    scannedById: string;
    source: MonthlyAuditScanSource;
    serials: string | string[];
  },
): Promise<{ results: ScanItemResult[]; counts: Record<ScanOutcome, number> }> {
  const serials = prepareScanInput(input.serials);
  if (serials.length === 0) throw new Error("NO_SERIALS");
  if (serials.length > MAX_SCANS_PER_REQUEST) throw new Error("TOO_MANY_SERIALS");

  const results = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: MonthlyAuditStatus }[]>`
      SELECT status FROM inventory_monthly_audits
      WHERE id = ${input.auditId}::uuid
      FOR UPDATE
    `;
    if (locked.length === 0) throw new Error("NOT_FOUND");
    if (locked[0].status !== MonthlyAuditStatus.OPEN) {
      throw new Error("AUDIT_NOT_OPEN");
    }

    const [existingScans, snapshotRows] = await Promise.all([
      tx.inventoryMonthlyAuditScan.findMany({
        where: { auditId: input.auditId, serialNumber: { in: serials } },
        select: { serialNumber: true },
      }),
      tx.inventoryMonthlyAuditSnapshot.findMany({
        where: { auditId: input.auditId, serialNumber: { in: serials } },
        select: { serialNumber: true, serialId: true },
      }),
    ]);

    const alreadyScanned = new Set(existingScans.map((s) => s.serialNumber));
    const snapshot = new Map<string, string>();
    for (const row of snapshotRows) {
      if (!snapshot.has(row.serialNumber)) snapshot.set(row.serialNumber, row.serialId);
    }

    const classifiedAll = classifyScanBatch(serials, alreadyScanned, snapshot);

    // Serials that belong to an excluded company (e.g. Ivaan Demo) are out of scope:
    // drop them from the run entirely, so they never become Additional findings.
    const additionalNumbers = classifiedAll
      .filter((r) => r.outcome === "ADDITIONAL")
      .map((r) => r.serialNumber);
    const excludedRows =
      additionalNumbers.length > 0
        ? await tx.inventorySerial.findMany({
            where: {
              serialNumber: { in: additionalNumbers },
              currentWarehouse: { company: monthlyAuditExcludedCompanyFilter },
            },
            select: { serialNumber: true },
          })
        : [];
    const excludedNumbers = new Set(excludedRows.map((r) => r.serialNumber));
    const classified = classifiedAll.filter((r) => !excludedNumbers.has(r.serialNumber));
    const toInsert = classified.filter((r) => r.outcome !== "ALREADY_SCANNED");

    if (toInsert.length > 0) {
      await tx.inventoryMonthlyAuditScan.createMany({
        data: toInsert.map((r) => ({
          auditId: input.auditId,
          serialNumber: r.serialNumber,
          matchedSerialId: r.matchedSerialId,
          result:
            r.outcome === "FOUND"
              ? MonthlyAuditScanResult.FOUND
              : MonthlyAuditScanResult.ADDITIONAL,
          source: input.source,
          scannedById: input.scannedById,
        })),
        skipDuplicates: true,
      });
    }

    return classified;
  });

  const counts: Record<ScanOutcome, number> = {
    FOUND: 0,
    ADDITIONAL: 0,
    ALREADY_SCANNED: 0,
  };
  for (const r of results) counts[r.outcome] += 1;
  return { results, counts };
}

/** Live progress for the scan screen. */
export async function getMonthlyAuditScanSummary(
  prisma: PrismaClient,
  auditId: string,
) {
  const [expected, found, additional] = await Promise.all([
    prisma.inventoryMonthlyAuditSnapshot.count({ where: { auditId } }),
    prisma.inventoryMonthlyAuditScan.count({
      where: { auditId, result: MonthlyAuditScanResult.FOUND },
    }),
    prisma.inventoryMonthlyAuditScan.count({
      where: { auditId, result: MonthlyAuditScanResult.ADDITIONAL },
    }),
  ]);
  return { expected, found, additional, remaining: expected - found };
}
