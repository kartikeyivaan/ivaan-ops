import type { PurchaseRequestPriority, PurchaseRequestStatus } from "@prisma/client";

export const PURCHASE_REQUEST_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  ORDERED: "Ordered",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  FULFILLED: "Fulfilled",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const PURCHASE_REQUEST_PRIORITY_LABELS: Record<PurchaseRequestPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PURCHASE_REQUEST_STATUSES = Object.keys(
  PURCHASE_REQUEST_STATUS_LABELS,
) as PurchaseRequestStatus[];

export const PURCHASE_REQUEST_PRIORITIES = Object.keys(
  PURCHASE_REQUEST_PRIORITY_LABELS,
) as PurchaseRequestPriority[];

export const TERMINAL_PURCHASE_REQUEST_STATUSES: PurchaseRequestStatus[] = [
  "FULFILLED",
  "REJECTED",
  "CANCELLED",
];

export const MANAGER_SETTABLE_STATUSES: PurchaseRequestStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "ORDERED",
  "REJECTED",
  "CANCELLED",
];
