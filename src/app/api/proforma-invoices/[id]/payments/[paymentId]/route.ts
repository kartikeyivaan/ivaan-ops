import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canRecordPayments } from "@/lib/pi-permissions";
import { deletePayment, updatePayment } from "@/lib/pi-service";
import { toDateOnly } from "@/lib/proforma-invoices";
import { prisma } from "@/lib/prisma";
import { updatePaymentSchema } from "@/lib/validations";
import { requireActiveCompany } from "@/lib/session";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

function mapPaymentMutationError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "NOT_FOUND") {
    return errorResponse("NOT_FOUND", "Proforma invoice not found.", 404);
  }
  if (error.message === "PAYMENT_NOT_FOUND") {
    return errorResponse("NOT_FOUND", "Payment not found on this proforma invoice.", 404);
  }
  if (error.message === "INVALID_STATUS") {
    return errorResponse(
      "INVALID_STATUS",
      "Payments cannot be changed on draft or cancelled PIs.",
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
  if (error.message === "BANK_LINKED_EDIT_FORBIDDEN") {
    return errorResponse(
      "BANK_LINKED",
      "Bank-verified payments cannot be edited. Use Remove Assignment first.",
      400,
    );
  }
  if (error.message === "BANK_LINKED_DELETE_FORBIDDEN") {
    return errorResponse(
      "BANK_LINKED",
      "Bank-linked payments cannot be deleted. Use Remove Assignment instead.",
      400,
    );
  }
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const { id, paymentId } = await context.params;
  const body = await request.json();
  const parsed = updatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid payment data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const pi = await updatePayment(prisma, {
      companyId,
      piId: id,
      paymentId,
      amount: parsed.data.amount,
      paymentDate: toDateOnly(new Date(parsed.data.paymentDate)),
      paymentMode: parsed.data.paymentMode,
      receivedInAccount: parsed.data.receivedInAccount,
      referenceNo: parsed.data.referenceNo,
      notes: parsed.data.notes,
      performedById: session.user.id,
    });
    return NextResponse.json(pi);
  } catch (error) {
    const mapped = mapPaymentMutationError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  const { id, paymentId } = await context.params;

  try {
    const pi = await deletePayment(prisma, {
      companyId,
      piId: id,
      paymentId,
      performedById: session.user.id,
    });
    return NextResponse.json(pi);
  } catch (error) {
    const mapped = mapPaymentMutationError(error);
    if (mapped) return mapped;
    throw error;
  }
}
