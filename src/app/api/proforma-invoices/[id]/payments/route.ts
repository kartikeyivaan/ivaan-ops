import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canRecordPayments,
} from "@/lib/pi-permissions";
import { recordPayment } from "@/lib/pi-service";
import { toDateOnly } from "@/lib/proforma-invoices";
import { prisma } from "@/lib/prisma";
import { recordPaymentSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRecordPayments(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid payment data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const pi = await recordPayment(prisma, {
      companyId,
      piId: id,
      amount: parsed.data.amount,
      paymentDate: toDateOnly(new Date(parsed.data.paymentDate)),
      paymentMode: parsed.data.paymentMode,
      receivedInAccount: parsed.data.receivedInAccount,
      referenceNo: parsed.data.referenceNo,
      notes: parsed.data.notes,
      recordedById: session.user.id,
    });
    return NextResponse.json(pi);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
      }
      if (error.message === "INVALID_STATUS") {
        return errorResponse(
          "INVALID_STATUS",
          "Payments cannot be recorded on draft or cancelled PIs.",
          400,
        );
      }
      if (error.message === "INVALID_AMOUNT") {
        return errorResponse("VALIDATION_ERROR", "Payment amount must be positive.", 400);
      }
      if (error.message === "PAYMENT_EXCEEDS_OUTSTANDING") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Payment exceeds outstanding PI balance.",
          400,
        );
      }
    }
    throw error;
  }
}
