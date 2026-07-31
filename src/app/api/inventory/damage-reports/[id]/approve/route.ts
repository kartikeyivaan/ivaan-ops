import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { canApprovePanelDamage } from "@/lib/inventory-permissions";
import { approveDamageReport } from "@/lib/damage-report-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canApprovePanelDamage(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const remarks =
    typeof body === "object" && body && "remarks" in body && typeof body.remarks === "string"
      ? body.remarks
      : undefined;

  try {
    await assertInventoryOpsAllowed(prisma, companyId);
    const report = await approveDamageReport(prisma, {
      companyId,
      reportId: id,
      approvedById: session.user.id,
      remarks,
    });
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVENTORY_OPS_BLOCKED") {
        return errorResponse(
          "INVENTORY_OPS_BLOCKED",
          "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
          423,
        );
      }
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Damage report not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse("INVALID_STATUS", "This report is not pending approval.", 400);
      }
      if (error.message === "SERIAL_NOT_AVAILABLE") {
        return errorResponse(
          "SERIAL_NOT_AVAILABLE",
          "Panel status changed; cannot approve this damage report.",
          409,
        );
      }
    }
    throw error;
  }
}
