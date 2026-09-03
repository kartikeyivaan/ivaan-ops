import { NextResponse } from "next/server";

export function refundErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

/** Service error code → [status, api code, user-facing message]. */
const SERVICE_ERROR_MAP: Record<string, [number, string, string]> = {
  NOT_FOUND: [404, "NOT_FOUND", "Refund not found."],
  COMPANY_REQUIRED: [400, "COMPANY_REQUIRED", "Select a company to continue."],

  // Verification code
  INVALID_PAYMENT_CODE: [
    400,
    "INVALID_PAYMENT_CODE",
    "That is not a valid verification code.",
  ],
  PAYMENT_CODE_NOT_FOUND: [
    404,
    "PAYMENT_CODE_NOT_FOUND",
    "No received payment matches this verification code.",
  ],
  BANK_COMPANY_MISMATCH: [
    400,
    "BANK_COMPANY_MISMATCH",
    "This verification code belongs to a different firm. Select the correct firm and try again.",
  ],

  // Customer
  CUSTOMER_REQUIRED: [
    400,
    "CUSTOMER_REQUIRED",
    "This receipt is not linked to a customer yet. Select the customer to refund.",
  ],
  CUSTOMER_NOT_FOUND: [404, "CUSTOMER_NOT_FOUND", "Customer not found."],
  CUSTOMER_MISMATCH: [
    400,
    "CUSTOMER_MISMATCH",
    "The customer must match the verified payment data.",
  ],

  // Amounts
  REFUND_AMOUNT_INVALID: [
    400,
    "REFUND_AMOUNT_INVALID",
    "Refund amount must be greater than zero.",
  ],
  REFUND_AMOUNT_EXCEEDS_AVAILABLE: [
    400,
    "REFUND_AMOUNT_EXCEEDS_AVAILABLE",
    "Refund amount exceeds the available refundable amount on this receipt.",
  ],
  REFUND_AMOUNT_EXCEEDS_APPROVED: [
    400,
    "REFUND_AMOUNT_EXCEEDS_APPROVED",
    "The executed amount cannot exceed the approved amount. Return the refund for correction to change it.",
  ],

  // Reason / remarks
  REMARKS_REQUIRED_FOR_OTHER: [
    400,
    "REMARKS_REQUIRED_FOR_OTHER",
    "Remarks are required when the reason is Other.",
  ],
  REJECTION_REASON_REQUIRED: [
    400,
    "REJECTION_REASON_REQUIRED",
    "A rejection reason is required.",
  ],
  RETURN_REASON_REQUIRED: [
    400,
    "RETURN_REASON_REQUIRED",
    "A correction reason is required.",
  ],
  FAILURE_REASON_REQUIRED: [
    400,
    "FAILURE_REASON_REQUIRED",
    "A failure reason is required.",
  ],

  // Bank transaction references
  INVALID_TRANSACTION_REFERENCE: [
    400,
    "INVALID_TRANSACTION_REFERENCE",
    "One or more selected bank transactions do not exist or do not belong to this firm.",
  ],

  // Refund bank accounts
  REFUND_BANK_ACCOUNT_REQUIRED: [
    400,
    "REFUND_BANK_ACCOUNT_REQUIRED",
    "Refund bank account details are required.",
  ],
  REFUND_BANK_ACCOUNT_NOT_FOUND: [
    404,
    "REFUND_BANK_ACCOUNT_NOT_FOUND",
    "The selected refund bank account was not found.",
  ],
  REFUND_BANK_ACCOUNT_CUSTOMER_MISMATCH: [
    400,
    "REFUND_BANK_ACCOUNT_CUSTOMER_MISMATCH",
    "That refund bank account belongs to a different customer.",
  ],
  INVALID_IFSC: [400, "INVALID_IFSC", "Enter a valid IFSC (e.g. HDFC0001234)."],
  INVALID_ACCOUNT_NUMBER: [
    400,
    "INVALID_ACCOUNT_NUMBER",
    "Account number must be 9–18 digits.",
  ],
  REFUND_FROM_BANK_ACCOUNT_NOT_FOUND: [
    404,
    "REFUND_FROM_BANK_ACCOUNT_NOT_FOUND",
    "The selected firm bank account was not found.",
  ],
  REFUND_FROM_BANK_ACCOUNT_COMPANY_MISMATCH: [
    400,
    "REFUND_FROM_BANK_ACCOUNT_COMPANY_MISMATCH",
    "That bank account belongs to a different firm. Select a bank account of this refund's firm.",
  ],

  // Workflow state
  REFUND_NOT_EDITABLE: [
    409,
    "REFUND_NOT_EDITABLE",
    "Only draft refunds can be edited. Ask the Sales Manager to return it for correction.",
  ],
  REFUND_NOT_SUBMITTABLE: [
    409,
    "REFUND_NOT_SUBMITTABLE",
    "Only draft refunds can be submitted for approval.",
  ],
  REFUND_NOT_PENDING_APPROVAL: [
    409,
    "REFUND_NOT_PENDING_APPROVAL",
    "This refund is not awaiting approval.",
  ],
  REFUND_NOT_APPROVED: [
    409,
    "REFUND_NOT_APPROVED",
    "Only approved refunds can be executed.",
  ],
  REFUND_NOT_RETURNABLE: [
    409,
    "REFUND_NOT_RETURNABLE",
    "This refund cannot be returned for correction at its current stage.",
  ],
  REFUND_NOT_CANCELLABLE: [
    409,
    "REFUND_NOT_CANCELLABLE",
    "Only draft or pending-approval refunds can be cancelled.",
  ],
  REFUND_ALREADY_EXECUTED: [
    409,
    "REFUND_ALREADY_EXECUTED",
    "This refund has already been executed and cannot be changed.",
  ],

  // Execution
  UTR_REQUIRED: [
    400,
    "UTR_REQUIRED",
    "UTR / transaction reference is required to mark a refund as refunded.",
  ],
  UTR_ALREADY_USED: [
    409,
    "UTR_ALREADY_USED",
    "That UTR is already recorded against another refund.",
  ],
};

/**
 * Map a service-thrown Error("CODE") to an HTTP response. Returns null when the
 * error is not a known service code so the caller can log and 500.
 */
export function mapRefundServiceError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const mapped = SERVICE_ERROR_MAP[error.message];
  if (!mapped) return null;
  return refundErrorResponse(mapped[1], mapped[2], mapped[0]);
}

export function handleRefundRouteError(error: unknown, context: string) {
  const mapped = mapRefundServiceError(error);
  if (mapped) return mapped;
  console.error(`${context} failed`, error);
  return refundErrorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
}
