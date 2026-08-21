import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeBankPaymentAssignment } from "@/lib/bank-allocation-service";
import { canAllocateBankPayments } from "@/lib/banking-permissions";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canAllocateBankPayments(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id, paymentId } = await context.params;

  try {
    await removeBankPaymentAssignment(prisma, {
      companyId,
      piId: id,
      paymentId,
      performedById: session.user.id,
    });
    const pi = await getProformaInvoiceById(prisma, companyId, id);
    if (!pi) {
      return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    }
    return NextResponse.json(pi);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === "PAYMENT_NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Payment not found.", 404);
    }
    if (error.message === "NOT_BANK_LINKED") {
      return errorResponse(
        "VALIDATION_ERROR",
        "This payment is not linked to a bank transaction.",
        400,
      );
    }
    throw error;
  }
}
