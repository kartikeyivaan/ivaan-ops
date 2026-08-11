import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { approvePiCreditAccounts } from "@/lib/pi-credit-service";
import { canApprovePiCreditAccounts } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { approvePiCreditSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canApprovePiCreditAccounts(session.user.roles)) {
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
  const parsed = approvePiCreditSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid approval data.", 400, parsed.error.flatten());
  }

  try {
    const credit = await approvePiCreditAccounts(prisma, {
      companyId,
      piId: id,
      approvedById: session.user.id,
      remarks: parsed.data.remarks,
    });
    return NextResponse.json(credit);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "NO_PENDING_CREDIT_ACCOUNTS") {
        return errorResponse(
          "NO_PENDING_CREDIT_ACCOUNTS",
          "No pending Accounts credit approval for this PI.",
          400,
        );
      }
      if (error.message === "NO_OUTSTANDING") {
        return errorResponse(
          "NO_OUTSTANDING",
          "Outstanding is already within tolerance; credit is not needed.",
          400,
        );
      }
    }
    throw error;
  }
}
