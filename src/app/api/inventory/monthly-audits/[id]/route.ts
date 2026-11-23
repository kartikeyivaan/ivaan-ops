import { prisma } from "@/lib/prisma";
import { auditErrorResponse } from "@/lib/inventory-audit-api";
import {
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { getMonthlyAuditReconciliation } from "@/lib/monthly-serial-audit-approve";
import { getMonthlyAuditScanSummary } from "@/lib/monthly-serial-audit-scan";

type Params = { params: Promise<{ id: string }> };

/** GET: run detail with scan progress and the reconciliation lists. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    const [reconciliation, scanSummary] = await Promise.all([
      getMonthlyAuditReconciliation(prisma, id),
      getMonthlyAuditScanSummary(prisma, id),
    ]);
    return Response.json({ ...reconciliation, scanSummary });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return auditErrorResponse("NOT_FOUND", "Monthly audit not found.", 404);
    }
    return mapMonthlyAuditError(error, "Failed to load monthly audit.");
  }
}
