import { prisma } from "@/lib/prisma";
import {
  canManageMonthlyAudit,
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { createMonthlyAuditQtyLines } from "@/lib/monthly-serial-audit-approve";
import { startMonthlyAudit } from "@/lib/monthly-serial-audit-service";

/** GET: list runs (newest first). */
export async function GET() {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const audits = await prisma.inventoryMonthlyAudit.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      startedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  return Response.json(audits);
}

/** POST: start a run (Super Admin). Takes the serial snapshot, then creates section B lines. */
export async function POST() {
  const guard = await requireMonthlyAuditUser(canManageMonthlyAudit);
  if ("response" in guard) return guard.response;

  try {
    const audit = await startMonthlyAudit(prisma, { startedById: guard.userId });
    // Safe to re-run: the create skips existing lines.
    const qtyLineCount = await createMonthlyAuditQtyLines(prisma, audit.id);
    return Response.json({ ...audit, qtyLineCount }, { status: 201 });
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to start monthly audit.");
  }
}
