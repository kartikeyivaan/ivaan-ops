import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { matchManualPaymentWithBank } from "@/lib/bank-allocation-service";
import { canAllocateBankPayments } from "@/lib/banking-permissions";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { z } from "zod";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

const bodySchema = z.object({
  paymentCode: z.string().trim().min(4).max(16),
});

export async function POST(request: Request, context: RouteContext) {
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
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Payment code is required.", 400);
  }

  try {
    await matchManualPaymentWithBank(prisma, {
      companyId,
      piId: id,
      paymentId,
      paymentCode: parsed.data.paymentCode,
      performedById: session.user.id,
    });
    const pi = await getProformaInvoiceById(prisma, companyId, id);
    if (!pi) {
      return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    }
    return NextResponse.json(pi);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const map: Record<string, [string, string, number]> = {
      NOT_FOUND: ["NOT_FOUND", "Proforma invoice not found.", 404],
      PAYMENT_NOT_FOUND: ["NOT_FOUND", "Payment not found.", 404],
      ALREADY_VERIFIED: ["VALIDATION_ERROR", "Payment is already bank verified.", 400],
      INVALID_PAYMENT_CODE: ["VALIDATION_ERROR", "Invalid payment code format.", 400],
      PAYMENT_CODE_NOT_FOUND: ["NOT_FOUND", "No credit transaction found for that payment code.", 404],
      ALLOCATION_EXCEEDS_BANK: [
        "VALIDATION_ERROR",
        "Payment amount exceeds available bank amount.",
        400,
      ],
      ACCOUNT_MISMATCH: [
        "VALIDATION_ERROR",
        "Received-in account does not match the bank transaction.",
        400,
      ],
      DIFFERENT_CUSTOMER: [
        "VALIDATION_ERROR",
        "This bank receipt is already allocated to a different customer.",
        400,
      ],
      DIFFERENT_GST: [
        "VALIDATION_ERROR",
        "This bank receipt is already allocated to a different GST registration.",
        400,
      ],
    };
    const hit = map[error.message];
    if (hit) return errorResponse(hit[0], hit[1], hit[2]);
    throw error;
  }
}
