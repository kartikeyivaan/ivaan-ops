import { CustomerType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const CUSTOMER_TYPES = [
  { value: CustomerType.DEALER, label: "Dealer" },
  { value: CustomerType.PROJECT, label: "Project" },
] as const;

export function normalizeGstNumber(gst: string): string {
  return gst.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidGstFormat(gst: string): boolean {
  const normalized = normalizeGstNumber(gst);
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(normalized);
}

export async function generateCustomerCode(
  prisma: PrismaClient,
  companyId: string,
  companyCode: string,
): Promise<string> {
  const count = await prisma.customer.count({ where: { companyId } });
  const sequence = String(count + 1).padStart(5, "0");
  return `${companyCode}-CUST-${sequence}`;
}

/**
 * Outstanding = PI Value - Payments Received per BR-012.
 * Use getCustomerPiMetrics in pi-service for live values.
 */
export function calculateCustomerOutstanding(metrics?: {
  outstandingValue: number;
  openPiCount: number;
}): {
  outstandingValue: number;
  openPiCount: number;
  openQuotationCount: number;
  totalDispatchValueThisYear: number;
} {
  return {
    outstandingValue: metrics?.outstandingValue ?? 0,
    openPiCount: metrics?.openPiCount ?? 0,
    openQuotationCount: 0,
    totalDispatchValueThisYear: 0,
  };
}

export function formatCustomerType(type: CustomerType): string {
  return type === CustomerType.DEALER ? "Dealer" : "Project";
}

export const IMPORT_COLUMNS = [
  "customer_name",
  "customer_type",
  "gst_number",
  "address",
  "city",
  "state",
  "mobile",
  "email",
  "assigned_sales_email",
  "contact_name",
  "contact_designation",
  "contact_mobile",
  "contact_email",
] as const;

export type CustomerImportRow = {
  rowNumber: number;
  customerName: string;
  customerType: CustomerType;
  gstNumber: string;
  address?: string;
  city?: string;
  state?: string;
  mobile?: string;
  email?: string;
  assignedSalesEmail: string;
  contactName?: string;
  contactDesignation?: string;
  contactMobile?: string;
  contactEmail?: string;
};

export type CustomerImportPreviewRow = CustomerImportRow & {
  errors: string[];
  isValid: boolean;
};
