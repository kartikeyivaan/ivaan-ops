import { ROLES, hasRole } from "@/lib/rbac";

/**
 * Permissions and error mapping for the monthly serial audit (Phase 5).
 * Kept free of auth and Next.js imports so it can be unit tested directly.
 *
 * - Start, close, cancel, reopen, approve, export: Super Admin only.
 * - Scan serials and enter section B counts: Super Admin and Warehouse.
 * - View runs: the roles that can view inventory audits.
 *
 * The run spans all companies, so these routes do not use the active company.
 */

const VIEW_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.WAREHOUSE,
  ROLES.PURCHASE,
  ROLES.SALES_MANAGER,
] as const;

export function canViewMonthlyAudit(roles: string[]) {
  return hasRole(roles, [...VIEW_ROLES]);
}

export function canManageMonthlyAudit(roles: string[]) {
  return hasRole(roles, [ROLES.SUPER_ADMIN]);
}

export function canScanMonthlyAudit(roles: string[]) {
  return hasRole(roles, [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE]);
}

export type MonthlyAuditApiError = { code: string; message: string; status: number };

const MONTHLY_ERRORS: Record<string, MonthlyAuditApiError> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "Monthly audit not found.", status: 404 },
  LINE_NOT_FOUND: { code: "NOT_FOUND", message: "Count line not found.", status: 404 },
  MONTHLY_AUDIT_ACTIVE: {
    code: "MONTHLY_AUDIT_ACTIVE",
    message: "A monthly audit is already open or awaiting approval.",
    status: 409,
  },
  AUDIT_NOT_OPEN: {
    code: "AUDIT_NOT_OPEN",
    message: "This audit is not open for scanning or counting.",
    status: 409,
  },
  INVALID_TRANSITION: {
    code: "INVALID_TRANSITION",
    message: "This action is not allowed in the audit's current state.",
    status: 409,
  },
  NO_SERIALS: { code: "NO_SERIALS", message: "Enter at least one serial number.", status: 400 },
  TOO_MANY_SERIALS: {
    code: "TOO_MANY_SERIALS",
    message: "Too many serials in one request. Split the list.",
    status: 400,
  },
  CANCEL_REASON_REQUIRED: {
    code: "CANCEL_REASON_REQUIRED",
    message: "Enter a reason for cancelling.",
    status: 400,
  },
  NOTHING_TO_UNDO: {
    code: "NOTHING_TO_UNDO",
    message: "None of the selected items have a resolution to undo.",
    status: 409,
  },
  INVALID_QUANTITY: { code: "INVALID_QUANTITY", message: "Quantity must be zero or more.", status: 400 },
  QTY_NOT_COUNTED: {
    code: "QTY_NOT_COUNTED",
    message: "Every non-serialized product needs a count before approval.",
    status: 400,
  },
  PRODUCT_NOT_FOUND: { code: "PRODUCT_NOT_FOUND", message: "Product not found or inactive.", status: 400 },
  RUN_NOT_APPROVED: {
    code: "RUN_NOT_APPROVED",
    message: "Investigation is available only after the audit is approved.",
    status: 409,
  },
  INVESTIGATION_CLOSED: {
    code: "INVESTIGATION_CLOSED",
    message: "The investigation is closed. Reopen it to make changes.",
    status: 409,
  },
  INVESTIGATION_NOT_CLOSED: { code: "INVESTIGATION_NOT_CLOSED", message: "The investigation is not closed.", status: 409 },
  NO_ITEMS_SELECTED: { code: "NO_ITEMS_SELECTED", message: "Select at least one serial.", status: 400 },
  TOO_MANY_ITEMS: { code: "TOO_MANY_ITEMS", message: "Too many serials at once. Split the list.", status: 400 },
  NO_OPEN_ITEMS: { code: "NO_OPEN_ITEMS", message: "None of the selected serials are open.", status: 409 },
  ACTION_NOT_ALLOWED: {
    code: "ACTION_NOT_ALLOWED",
    message: "This action does not apply to these serials.",
    status: 400,
  },
  NOT_YET_ADDED: {
    code: "NOT_YET_ADDED",
    message: "This serial is not in stock yet. Add it through manual stock entry first.",
    status: 409,
  },
  SERIAL_NOT_UNDER_INVESTIGATION: {
    code: "SERIAL_NOT_UNDER_INVESTIGATION",
    message: "This serial is no longer under investigation.",
    status: 409,
  },
  LIVE_COPY_EXISTS: {
    code: "LIVE_COPY_EXISTS",
    message: "Another live record already uses this serial number.",
    status: 409,
  },
  NO_SERIAL_RECORD: {
    code: "NO_SERIAL_RECORD",
    message: "No serial record exists for this item, so it cannot be returned to stock.",
    status: 409,
  },
  OPEN_ITEMS_REMAIN: {
    code: "OPEN_ITEMS_REMAIN",
    message: "Resolve every item before closing the investigation.",
    status: 409,
  },
  WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Warehouse not found or inactive.", status: 400 },
  SERIAL_PRODUCT_NOT_ALLOWED: {
    code: "SERIAL_PRODUCT_NOT_ALLOWED",
    message: "Serialized products are counted by serial number, not by quantity.",
    status: 400,
  },
  QTY_LINE_EXISTS: {
    code: "QTY_LINE_EXISTS",
    message: "This product is already in the list for that company and warehouse.",
    status: 409,
  },
  INVENTORY_OPS_BLOCKED: {
    code: "INVENTORY_OPS_BLOCKED",
    message: "Stock movements are paused while the monthly audit is open.",
    status: 409,
  },
};

/** Returns the API error for a known service error message, or null. */
export function monthlyAuditErrorFor(error: unknown): MonthlyAuditApiError | null {
  if (!(error instanceof Error)) return null;
  return MONTHLY_ERRORS[error.message] ?? null;
}
