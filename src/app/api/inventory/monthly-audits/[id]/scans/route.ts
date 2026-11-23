import { z } from "zod";

import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canScanMonthlyAudit,
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { prisma } from "@/lib/prisma";
import {
  getMonthlyAuditScanSummary,
  MAX_SCANS_PER_REQUEST,
  recordMonthlyAuditScans,
} from "@/lib/monthly-serial-audit-scan";

type Params = { params: Promise<{ id: string }> };

const scanSchema = z.object({
  serials: z.union([
    z.string().min(1).max(500_000),
    z.array(z.string().min(1).max(200)).max(MAX_SCANS_PER_REQUEST),
  ]),
  source: z.enum(["CAMERA", "SCANNER", "PASTE"]),
});

/** GET: live scan progress. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  return Response.json(await getMonthlyAuditScanSummary(prisma, id));
}

/** POST: record scanned serials (single scan, paste or scanner batch). */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canScanMonthlyAudit);
  if ("response" in guard) return guard.response;

  const parsed = scanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return auditErrorResponse("VALIDATION_ERROR", "Invalid scan data.", 400, parsed.error.flatten());
  }

  const { id } = await params;
  try {
    const { results, counts } = await recordMonthlyAuditScans(prisma, {
      auditId: id,
      scannedById: guard.userId,
      source: parsed.data.source,
      serials: parsed.data.serials,
    });
    return Response.json({ results, counts });
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to record scans.");
  }
}
