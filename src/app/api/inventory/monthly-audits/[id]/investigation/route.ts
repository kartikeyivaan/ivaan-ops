import { prisma } from "@/lib/prisma";
import {
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";
import { listInvestigation } from "@/lib/monthly-serial-audit-investigation";

type Params = { params: Promise<{ id: string }> };

/** GET: investigation items for one tab (?type=MISSING or ADDITIONAL) plus the run's close state. */
export async function GET(request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type") === "ADDITIONAL" ? "ADDITIONAL" : "MISSING";
  try {
    const [rows, audit] = await Promise.all([
      listInvestigation(prisma, id, type),
      prisma.inventoryMonthlyAudit.findUnique({
        where: { id },
        select: { status: true, investigationClosedAt: true },
      }),
    ]);
    if (!audit) throw new Error("NOT_FOUND");
    return Response.json({
      type,
      status: audit.status,
      closedAt: audit.investigationClosedAt?.toISOString() ?? null,
      rows,
    });
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to load investigation.");
  }
}
