import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canApprovePiEdit } from "@/lib/pi-permissions";
import { approveProformaInvoiceEditByRequestId } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { approvePiCancelSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApprovePiEdit(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = approvePiCancelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, parsed.error.flatten());
  }

  try {
    const pi = await approveProformaInvoiceEditByRequestId(prisma, {
      companyId,
      editRequestId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "PI edit request not found.", 404);
      }
      if (error.message === "NO_PENDING_EDIT") {
        return errorResponse("NO_PENDING_EDIT", "No pending PI edit request found.", 400);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse(
          "INVALID_STATUS",
          "This PI can no longer be updated with the pending edit.",
          400,
        );
      }
      if (error.message === "TOTAL_BELOW_PAID") {
        return errorResponse(
          "TOTAL_BELOW_PAID",
          "The updated PI total cannot be less than payments already received. Add, remove, or update payment entries first.",
          400,
        );
      }
    }
    throw error;
  }
}
