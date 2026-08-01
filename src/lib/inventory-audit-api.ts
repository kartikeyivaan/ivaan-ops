import { NextResponse } from "next/server";

export function auditErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function mapAuditServiceError(error: unknown) {
  if (!(error instanceof Error)) return null;

  const map: Record<string, [string, string, number]> = {
    NOT_FOUND: ["NOT_FOUND", "Audit not found.", 404],
    LINE_NOT_FOUND: ["NOT_FOUND", "Audit line not found.", 404],
    COMPANY_NOT_FOUND: ["NOT_FOUND", "Company not found.", 404],
    WAREHOUSE_NOT_FOUND: ["NOT_FOUND", "Warehouse not found.", 404],
    PRODUCT_NOT_FOUND: ["NOT_FOUND", "Product not found.", 404],
    FORBIDDEN: ["FORBIDDEN", "You do not have permission for this action.", 403],
    INVENTORY_OPS_BLOCKED: [
      "INVENTORY_OPS_BLOCKED",
      "Inventory operations are blocked until Opening Stock Audit is approved for all warehouses.",
      423,
    ],
    OPENING_ALREADY_COMPLETED: [
      "OPENING_ALREADY_COMPLETED",
      "Opening stock is already completed for this company.",
      400,
    ],
    APPROVED_AUDITS_EXIST: [
      "APPROVED_AUDITS_EXIST",
      "Cannot reset stock after an opening audit has been approved.",
      400,
    ],
    OPEN_TRANSFERS_EXIST: [
      "OPEN_TRANSFERS_EXIST",
      "Complete or cancel open stock transfers before resetting opening stock.",
      400,
    ],
    OPENING_NOT_IN_PROGRESS: [
      "OPENING_NOT_IN_PROGRESS",
      "Start Opening Stock preparation before creating or approving audits.",
      400,
    ],
    AUDIT_EXISTS: ["AUDIT_EXISTS", "An opening audit already exists for this warehouse.", 409],
    AUDIT_LOCKED: ["AUDIT_LOCKED", "This audit can no longer be edited.", 400],
    AUDIT_NOT_SUBMITTED: [
      "AUDIT_NOT_SUBMITTED",
      "Submit the audit for review before approving.",
      400,
    ],
    SERIAL_REQUIRED: [
      "SERIAL_REQUIRED",
      "Serial numbers are required for this product.",
      400,
    ],
    SERIAL_COUNT_MISMATCH: [
      "SERIAL_COUNT_MISMATCH",
      "Physical quantity must match scanned serial count.",
      400,
    ],
    DUPLICATE_SERIAL: ["DUPLICATE_SERIAL", "Serial number already exists.", 409],
    DUPLICATE_SERIAL_IN_AUDIT: [
      "DUPLICATE_SERIAL_IN_AUDIT",
      "Serial number already scanned on another line in this audit.",
      409,
    ],
    DAMAGED_MODULES_ONLY: [
      "DAMAGED_SERIAL_PRODUCTS_ONLY",
      "Damaged section is only for serial-tracked Modules and Inverters.",
      400,
    ],
    DAMAGED_SERIAL_PRODUCTS_ONLY: [
      "DAMAGED_SERIAL_PRODUCTS_ONLY",
      "Damaged section is only for serial-tracked Modules and Inverters.",
      400,
    ],
    INVALID_QUANTITY: ["INVALID_QUANTITY", "Quantity is invalid.", 400],
    INVENTORY_NOT_LIVE: [
      "INVENTORY_NOT_LIVE",
      "Daily audits are available only after Opening Stock is approved and inventory is live.",
      400,
    ],
    COUNTS_INCOMPLETE: [
      "COUNTS_INCOMPLETE",
      "Enter physical quantity for every product before submitting.",
      400,
    ],
  };

  const mapped = map[error.message];
  if (!mapped) return null;
  return auditErrorResponse(mapped[0], mapped[1], mapped[2]);
}
