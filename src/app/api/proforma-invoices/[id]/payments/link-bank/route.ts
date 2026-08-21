import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  linkBankPaymentToPi,
  previewBankPaymentLink,
} from "@/lib/bank-allocation-service";
import { canAllocateBankPayments } from "@/lib/banking-permissions";
import { getProformaInvoiceById } from "@/lib/pi-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { z } from "zod";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  paymentCode: z.string().trim().min(4).max(16),
  amount: z.coerce.number().positive().optional(),
  previewOnly: z.boolean().optional(),
});

function mapLinkError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const map: Record<string, [string, string, number]> = {
    NOT_FOUND: ["NOT_FOUND", "Proforma invoice not found.", 404],
    INVALID_STATUS: ["INVALID_STATUS", "Payments cannot be linked on this PI status.", 400],
    INVALID_PAYMENT_CODE: ["VALIDATION_ERROR", "Invalid payment code format.", 400],
    PAYMENT_CODE_NOT_FOUND: ["NOT_FOUND", "No credit transaction found for that payment code.", 404],
    BANK_COMPANY_MISMATCH: [
      "VALIDATION_ERROR",
      "This payment code belongs to a different firm. Use Daily Receipts for the same company as the PI.",
      400,
    ],
    BANK_FULLY_ALLOCATED: ["VALIDATION_ERROR", "This bank receipt is fully allocated.", 400],
    PI_FULLY_PAID: ["VALIDATION_ERROR", "This PI has no outstanding balance.", 400],
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
    INVALID_AMOUNT: ["VALIDATION_ERROR", "Allocation amount must be positive.", 400],
    ALLOCATION_EXCEEDS_LIMIT: [
      "VALIDATION_ERROR",
      "Allocation cannot exceed the default (min of available bank amount and PI outstanding).",
      400,
    ],
    ALLOCATION_EXCEEDS_BANK: [
      "VALIDATION_ERROR",
      "Allocation exceeds available bank amount.",
      400,
    ],
    PAYMENT_EXCEEDS_OUTSTANDING: [
      "VALIDATION_ERROR",
      "Allocation exceeds PI outstanding.",
      400,
    ],
  };
  const hit = map[error.message];
  return hit ? errorResponse(hit[0], hit[1], hit[2]) : null;
}

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

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid link payment request.", 400);
  }

  try {
    if (parsed.data.previewOnly) {
      const preview = await previewBankPaymentLink(prisma, {
        companyId,
        piId: id,
        paymentCode: parsed.data.paymentCode,
      });
      return NextResponse.json(preview);
    }

    await linkBankPaymentToPi(prisma, {
      companyId,
      piId: id,
      paymentCode: parsed.data.paymentCode,
      amount: parsed.data.amount,
      recordedById: session.user.id,
    });

    const pi = await getProformaInvoiceById(prisma, companyId, id);
    if (!pi) {
      return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
    }
    return NextResponse.json(pi);
  } catch (error) {
    const mapped = mapLinkError(error);
    if (mapped) return mapped;
    throw error;
  }
}
