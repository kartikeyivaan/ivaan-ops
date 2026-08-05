import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canApplyIncomingLotReceiveEdit,
  canProposeIncomingLotReceiveEdit,
  canViewSerialNumbers,
} from "@/lib/inventory-permissions";
import { submitIncomingLotReceiveEdit } from "@/lib/incoming-lot-change-service";
import { serializeLotForRole } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { incomingLotReceiveEditSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canProposeIncomingLotReceiveEdit(session.user.roles)) {
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
  const parsed = incomingLotReceiveEditSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid receive edit data.", 400, parsed.error.flatten());
  }

  const applyImmediately = canApplyIncomingLotReceiveEdit(session.user.roles);

  try {
    const result = await submitIncomingLotReceiveEdit(prisma, {
      lotId: id,
      companyId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      purchaseInvoiceNo: parsed.data.purchaseInvoiceNo,
      requestedById: session.user.id,
      applyImmediately,
    });

    return NextResponse.json({
      mode: result.mode,
      changeRequest: result.changeRequest,
      lot: result.lot
        ? serializeLotForRole(result.lot, canViewSerialNumbers(session.user.roles))
        : null,
      message:
        result.mode === "APPLIED"
          ? "Lot details updated."
          : "Change submitted for Purchase approval.",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Incoming lot not found.", 404);
      }
      if (error.message === "LOT_NOT_EDITABLE") {
        return errorResponse(
          "VALIDATION_ERROR",
          "Only pending incoming lots with no receipts can be edited.",
          400,
        );
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Product not found.", 404);
      }
      if (error.message === "INVALID_QUANTITY") {
        return errorResponse("VALIDATION_ERROR", "Quantity must be greater than zero.", 400);
      }
      if (error.message === "PURCHASE_INVOICE_REQUIRED") {
        return errorResponse("VALIDATION_ERROR", "Purchase invoice number is required.", 400);
      }
      if (error.message === "DUPLICATE_PURCHASE_INVOICE") {
        return errorResponse(
          "DUPLICATE_PURCHASE_INVOICE",
          "This purchase invoice number already exists.",
          409,
        );
      }
      if (error.message === "NO_CHANGES") {
        return errorResponse("VALIDATION_ERROR", "No changes to save.", 400);
      }
      if (error.message === "PENDING_CHANGE_EXISTS") {
        return errorResponse(
          "PENDING_CHANGE_EXISTS",
          "A receive edit for this lot is already pending approval.",
          409,
        );
      }
    }
    throw error;
  }
}
