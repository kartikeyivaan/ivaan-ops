import { NextResponse } from "next/server";

const SERVICE_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "Project or dispatch not found.", status: 404 },
  PROJECT_CLOSED: { message: "This project is closed and cannot be dispatched.", status: 400 },
  FORBIDDEN: { message: "You do not have permission for this action.", status: 403 },
  LINES_REQUIRED: { message: "Add at least one line with quantity greater than zero.", status: 400 },
  INVALID_LINE: { message: "Invalid dispatch line.", status: 400 },
  EXCEEDS_REMAINING_QTY: { message: "Quantity exceeds remaining balance in Projects warehouse.", status: 400 },
  SERIAL_REQUIRED: { message: "Serial selection is required for this product.", status: 400 },
  INVALID_SERIAL_SELECTION: { message: "Invalid serial selection.", status: 400 },
  KIT_BOM_EMPTY: { message: "Kit has no components configured.", status: 400 },
  KIT_COMPONENT_MISSING: {
    message: "Dispatch all kit components together with matching quantities.",
    status: 400,
  },
  KIT_QTY_MISMATCH: {
    message: "Kit component quantities must match the BOM ratio.",
    status: 400,
  },
  INVALID_QUANTITY: { message: "Invalid quantity.", status: 400 },
  INVALID_STATUS: { message: "Dispatch is not in a valid status for this action.", status: 400 },
  MANDATORY_DISPATCH_FIELDS_REQUIRED: {
    message: "Receiver name, receiver mobile and vehicle number are required.",
    status: 400,
  },
  NEGATIVE_STOCK_BLOCKED: {
    message: "Insufficient available stock to complete this dispatch.",
    status: 400,
  },
  WRONG_PRODUCT: { message: "Serial belongs to a different product.", status: 400 },
  SERIAL_NOT_FOUND: { message: "Serial not found or not available.", status: 404 },
};

export function projectDispatchErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function mapProjectDispatchError(error: unknown) {
  if (!(error instanceof Error)) return null;

  const mapped = SERVICE_ERRORS[error.message];
  if (mapped) {
    return projectDispatchErrorResponse(error.message, mapped.message, mapped.status);
  }

  if (error.message.startsWith("KIT_BOM_EMPTY|")) {
    return projectDispatchErrorResponse(
      "KIT_BOM_EMPTY",
      SERVICE_ERRORS.KIT_BOM_EMPTY.message,
      400,
    );
  }

  return null;
}
