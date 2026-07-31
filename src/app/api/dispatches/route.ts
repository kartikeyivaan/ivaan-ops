import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canManageDispatches,
  canViewDispatches,
} from "@/lib/dispatch-permissions";
import { createDispatch, listDispatches } from "@/lib/dispatch-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { createDispatchSchema, dispatchSearchSchema } from "@/lib/validations";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ code, message, details }, { status });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsed = dispatchSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    customerId: searchParams.get("customerId") ?? undefined,
    proformaInvoiceId: searchParams.get("proformaInvoiceId") ?? undefined,
    fromDate: searchParams.get("fromDate") ?? undefined,
    toDate: searchParams.get("toDate") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters.", 400, parsed.error.flatten());
  }

  const rows = await listDispatches(prisma, companyId, parsed.data);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canManageDispatches(session.user.roles)) {
    return errorResponse("FORBIDDEN", "You do not have permission for this action.", 403);
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    return errorResponse("COMPANY_REQUIRED", "Select a company to continue.", 400);
  }

  const body = await request.json();
  const parsed = createDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Invalid dispatch data.",
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const dispatch = await createDispatch(prisma, {
      companyId,
      proformaInvoiceId: parsed.data.proformaInvoiceId,
      createdById: session.user.id,
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
        NOT_FOUND: ["NOT_FOUND", "Proforma invoice not found.", 404],
        INVALID_PI_STATUS: ["INVALID_STATUS", "PI is not ready for dispatch.", 400],
        PAYMENT_INCOMPLETE: [
          "PAYMENT_INCOMPLETE",
          "Full payment is required before dispatch.",
          400,
        ],
        NOT_MARKED_DISPATCH_TODAY: [
          "NOT_MARKED_DISPATCH_TODAY",
          "Sales must mark this PI for dispatch today before warehouse can create a DC.",
          400,
        ],
        WAREHOUSE_REQUIRED: ["VALIDATION_ERROR", "PI warehouse is required.", 400],
        WAREHOUSE_MISMATCH: ["VALIDATION_ERROR", "Warehouse mismatch.", 400],
        LINES_REQUIRED: ["VALIDATION_ERROR", "Add at least one line.", 400],
        INVALID_QUANTITY: ["VALIDATION_ERROR", "Invalid quantity.", 400],
        INVALID_LINE: ["VALIDATION_ERROR", "Invalid dispatch line.", 400],
        EXCEEDS_REMAINING_QTY: ["VALIDATION_ERROR", "Quantity exceeds remaining booked qty.", 400],
        SERIAL_REQUIRED: ["VALIDATION_ERROR", "Serial selection required.", 400],
        INVALID_SERIAL_SELECTION: ["VALIDATION_ERROR", "Invalid serial selection.", 400],
        MANDATORY_DISPATCH_FIELDS_REQUIRED: [
          "VALIDATION_ERROR",
          "Receiver name, receiver mobile and vehicle number are required.",
          400,
        ],
      };
      const mapped = map[error.message];
      if (mapped) {
        return errorResponse(mapped[0], mapped[1], mapped[2]);
      }
    }
    throw error;
  }
}
