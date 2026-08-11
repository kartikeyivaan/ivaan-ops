import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestPiCredit } from "@/lib/pi-credit-service";
import { canRequestPiCredit } from "@/lib/pi-permissions";
import { prisma } from "@/lib/prisma";
import { requestPiCreditSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRequestPiCredit(session.user.roles)) {
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
  const parsed = requestPiCreditSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid credit request.", 400, parsed.error.flatten());
  }

  try {
    const credit = await requestPiCredit(prisma, {
      companyId,
      piId: id,
      requestedById: session.user.id,
      notes: parsed.data.notes,
    });
    return NextResponse.json(credit);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "CREDIT_NOT_REQUESTABLE") {
        return errorResponse(
          "CREDIT_NOT_REQUESTABLE",
          "Credit cannot be requested for this PI (need outstanding and no open credit request).",
          400,
        );
      }
      if (error.message === "CUSTOMER_CREDIT_OVERDUE") {
        return errorResponse(
          "CUSTOMER_CREDIT_OVERDUE",
          "This firm has overdue credit. Clear outstanding dues before requesting new credit.",
          400,
        );
      }
    }
    throw error;
  }
}
