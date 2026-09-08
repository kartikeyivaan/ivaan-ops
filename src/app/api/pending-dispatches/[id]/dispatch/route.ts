import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { assertInventoryOpsAllowed } from "@/lib/inventory-audit-service";
import { canRecordQueuedDispatch } from "@/lib/pi-permissions";
import { createQueuedDispatch } from "@/lib/pending-dispatch-service";
import { prisma } from "@/lib/prisma";
import { restrictSalesUserId } from "@/lib/report-permissions";
import { requireActiveCompany } from "@/lib/session";
import { createQueuedDispatchSchema } from "@/lib/validations";

export const maxDuration = 60;

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !canRecordQueuedDispatch(session.user.roles)) {
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
  const parsed = createQueuedDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid dispatch data.",
      400,
      parsed.error.flatten(),
    );
  }

  const salesUserId = restrictSalesUserId(session.user.roles, session.user.id);

  try {
    await assertInventoryOpsAllowed(prisma, companyId);

    const dispatch = await createQueuedDispatch(prisma, {
      companyId,
      piId: id,
      createdById: session.user.id,
      salesUserId,
      dispatchDate: parsed.data.dispatchDate,
      vehicleNo: parsed.data.vehicleNo,
      driverName: parsed.data.driverName,
      receiverName: parsed.data.receiverName,
      receiverMobile: parsed.data.receiverMobile,
      signatureUrl: parsed.data.signatureUrl || undefined,
      notes: parsed.data.notes,
      confirm: parsed.data.confirm,
      lines: parsed.data.lines,
    });
    return NextResponse.json(dispatch, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [string, string, number]> = {
        INVENTORY_OPS_BLOCKED: [
          "INVENTORY_OPS_BLOCKED",
          "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
          423,
        ],
        NOT_FOUND: ["NOT_FOUND", "Proforma invoice not found.", 404],
        NOT_QUEUED_FOR_DISPATCH: [
          "NOT_QUEUED_FOR_DISPATCH",
          "This PI has not been marked for dispatch.",
          400,
        ],
        DISPATCH_DATE_OUT_OF_RANGE: [
          "DISPATCH_DATE_OUT_OF_RANGE",
          "Dispatch date must be in this month or last month, and not in the future.",
          400,
        ],
        HAS_OPEN_DISPATCH: [
          "HAS_OPEN_DISPATCH",
          "A delivery challan is already in progress. Finish or cancel it first.",
          409,
        ],
        INVALID_PI_STATUS: ["INVALID_STATUS", "PI is not ready for dispatch.", 400],
        WAREHOUSE_REQUIRED: ["VALIDATION_ERROR", "PI warehouse is required.", 400],
        WAREHOUSE_MISMATCH: ["VALIDATION_ERROR", "Warehouse mismatch.", 400],
        LINES_REQUIRED: ["VALIDATION_ERROR", "Add at least one line.", 400],
        INVALID_QUANTITY: ["VALIDATION_ERROR", "Invalid quantity.", 400],
        INVALID_LINE: ["VALIDATION_ERROR", "Invalid dispatch line.", 400],
        EXCEEDS_REMAINING_QTY: ["VALIDATION_ERROR", "Quantity exceeds remaining booked qty.", 400],
        SERIAL_REQUIRED: [
          "VALIDATION_ERROR",
          "Serial-tracked items need one serial per dispatched unit. Scan or add serials to match dispatch qty, or dispatch only the serials already accepted.",
          400,
        ],
        INVALID_SERIAL_SELECTION: ["VALIDATION_ERROR", "Invalid serial selection.", 400],
        KIT_BOM_EMPTY: ["VALIDATION_ERROR", "Kit has no components configured.", 400],
        KIT_COMPONENT_MISSING: [
          "VALIDATION_ERROR",
          "Dispatch all kit components together with matching quantities.",
          400,
        ],
        KIT_QTY_MISMATCH: [
          "VALIDATION_ERROR",
          "Kit component quantities must match the BOM ratio.",
          400,
        ],
        MANDATORY_DISPATCH_FIELDS_REQUIRED: [
          "VALIDATION_ERROR",
          "Receiver name, receiver mobile and vehicle number are required.",
          400,
        ],
        NEGATIVE_STOCK_BLOCKED: [
          "NEGATIVE_STOCK_BLOCKED",
          "Insufficient available stock to complete this dispatch.",
          400,
        ],
      };
      const mapped = map[error.message];
      if (mapped) {
        return errorResponse(mapped[0], mapped[1], mapped[2]);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
        return errorResponse(
          "TRANSACTION_TIMEOUT",
          "Dispatch took too long to confirm. Please retry.",
          504,
        );
      }
    }
    throw error;
  }
}
