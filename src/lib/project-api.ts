import { NextResponse } from "next/server";

const SERVICE_ERRORS: Record<string, { message: string; status: number }> = {
  NOT_FOUND: { message: "Project not found.", status: 404 },
  PROJECT_CLOSED: { message: "This project is closed and cannot be edited.", status: 400 },
  ASSIGNMENT_NOT_FOUND: { message: "Material assignment not found.", status: 404 },
  LINE_NOT_FOUND: { message: "Material line not found.", status: 404 },
  INVALID_QTY: { message: "Quantity must be greater than zero.", status: 400 },
  CANNOT_DELETE_PROPOSAL_LINE: {
    message: "Lines from the proposal cannot be removed. Edit quantity instead.",
    status: 400,
  },
  LINE_ALREADY_DISPATCHED: {
    message: "Cannot remove a line that has already been dispatched.",
    status: 400,
  },
  QTY_BELOW_DISPATCHED: {
    message: "Required quantity cannot be less than already dispatched quantity.",
    status: 400,
  },
  PROJECTS_WAREHOUSE_NOT_FOUND: {
    message: "Jalgaon Projects warehouse is not configured for this company.",
    status: 500,
  },
  NO_DELTA: { message: "No changed or new lines require approval.", status: 400 },
  PENDING_APPROVAL_EXISTS: {
    message: "Material approval is already pending for this project.",
    status: 400,
  },
  ASSIGNMENT_EMPTY: { message: "Add at least one material line before submitting.", status: 400 },
  APPROVAL_NOT_PENDING: { message: "No pending material approval for this project.", status: 400 },
  INVALID_APPROVAL_PAYLOAD: { message: "Invalid approval payload.", status: 400 },
  FORBIDDEN: { message: "You do not have permission for this action.", status: 403 },
  ISE_COMPANY_NOT_FOUND: { message: "ISE company is not configured.", status: 500 },
  ISE_HO_NOT_FOUND: { message: "ISE Jalgaon HO warehouse is not configured.", status: 500 },
  PROJECT_COMPANY_MISMATCH: {
    message: "Project material assignment is only supported for ISE projects.",
    status: 400,
  },
  ALREADY_CLOSED: { message: "This project is already closed.", status: 400 },
  EXCEEDS_RETURN_BALANCE: {
    message: "Return quantity exceeds remaining balance in Projects warehouse.",
    status: 400,
  },
  RETURN_SOURCE_UNKNOWN: {
    message: "Unable to determine return destination for this line.",
    status: 400,
  },
  INSUFFICIENT_STOCK: {
    message: "Insufficient stock in Projects warehouse to complete return.",
    status: 400,
  },
};

export function projectErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function mapProjectError(error: unknown) {
  if (!(error instanceof Error)) return null;

  const mapped = SERVICE_ERRORS[error.message];
  if (mapped) {
    return projectErrorResponse(error.message, mapped.message, mapped.status);
  }

  return null;
}
