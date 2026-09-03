import type { CustomerRefundReason, CustomerRefundStatus } from "@prisma/client";

export const CUSTOMER_REFUND_STATUS_LABELS: Record<CustomerRefundStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  PROCESSING: "Processing",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

export const CUSTOMER_REFUND_REASON_LABELS: Record<CustomerRefundReason, string> = {
  ORDER_CANCELLED: "Order Cancelled",
  EXCESS_PAYMENT: "Excess Payment",
  DUPLICATE_PAYMENT: "Duplicate Payment",
  PARTIAL_ORDER_CANCELLATION: "Partial Order Cancellation",
  PAYMENT_RECEIVED_IN_ERROR: "Payment Received in Error",
  OTHER: "Other",
};

export const CUSTOMER_REFUND_STATUSES = Object.keys(
  CUSTOMER_REFUND_STATUS_LABELS,
) as CustomerRefundStatus[];

export const CUSTOMER_REFUND_REASONS = Object.keys(
  CUSTOMER_REFUND_REASON_LABELS,
) as CustomerRefundReason[];

/** Refund is finished; nothing further may change. */
export const TERMINAL_CUSTOMER_REFUND_STATUSES: CustomerRefundStatus[] = [
  "REFUNDED",
  "REJECTED",
  "CANCELLED",
];

/** Statuses the Sales Executive may still edit the request in. */
export const EDITABLE_CUSTOMER_REFUND_STATUSES: CustomerRefundStatus[] = ["DRAFT"];

/**
 * Once approved, the commercial and payee fields are frozen. Accounts can only
 * add execution details; corrections must go back through "Return for Correction".
 */
export const LOCKED_CUSTOMER_REFUND_STATUSES: CustomerRefundStatus[] = [
  "APPROVED",
  "PROCESSING",
  "REFUNDED",
];

/** Fields frozen at approval. Surfaced in the UI and enforced server-side. */
export const CUSTOMER_REFUND_LOCKED_FIELDS = [
  "requestedAmount",
  "customerId",
  "companyId",
  "refundBankAccountId",
  "bankTransactionId",
  "transactionReferences",
] as const;

/** Waiting on the Sales Manager. */
export const CUSTOMER_REFUND_APPROVAL_QUEUE_STATUSES: CustomerRefundStatus[] = [
  "PENDING_APPROVAL",
];

/** Waiting on Accounts / Super Admin to move money. */
export const CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES: CustomerRefundStatus[] = [
  "APPROVED",
  "PROCESSING",
  "FAILED",
];

/** Payment modes offered when recording an executed refund. */
export const CUSTOMER_REFUND_PAYMENT_MODES = [
  "BANK_TRANSFER",
  "NEFT",
  "RTGS",
  "UPI",
  "CHEQUE",
  "CASH",
] as const;

export function isCustomerRefundLocked(status: CustomerRefundStatus): boolean {
  return LOCKED_CUSTOMER_REFUND_STATUSES.includes(status);
}

export function isCustomerRefundTerminal(status: CustomerRefundStatus): boolean {
  return TERMINAL_CUSTOMER_REFUND_STATUSES.includes(status);
}

export function isCustomerRefundEditable(status: CustomerRefundStatus): boolean {
  return EDITABLE_CUSTOMER_REFUND_STATUSES.includes(status);
}

export const DOCUMENT_TYPE_CUSTOMER_REFUND = "CUSTOMER_REFUND";
