import type { ManualStockReason } from "@prisma/client";

export const MANUAL_STOCK_REASONS = [
  "FOUND_STOCK",
  "WRITE_OFF",
  "CORRECTION",
  "SAMPLE_DEMO",
  "INTER_BRANCH_PAPER",
  "CUSTOMER_RETURN_NO_SALES_DOC",
  "OTHER",
] as const satisfies readonly ManualStockReason[];

export const MANUAL_STOCK_REASON_LABELS: Record<ManualStockReason, string> = {
  FOUND_STOCK: "Found stock",
  WRITE_OFF: "Write-off",
  CORRECTION: "Correction",
  SAMPLE_DEMO: "Sample / demo",
  INTER_BRANCH_PAPER: "Inter-branch paper",
  CUSTOMER_RETURN_NO_SALES_DOC: "Customer return (no sales doc)",
  OTHER: "Other",
};

export const MANUAL_STOCK_ACTION_LABELS = {
  IN: "Inventory In",
  OUT: "Inventory Out",
  CHANGE_CONDITION: "Change condition",
} as const;

export const MANUAL_STOCK_CONDITION_LABELS = {
  GOOD: "Good",
  DAMAGED: "Damaged",
} as const;

export const MANUAL_STOCK_SOURCE = "MANUAL_STOCK_ENTRY";
