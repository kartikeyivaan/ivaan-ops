import { describe, expect, it } from "vitest";
import {
  BOOKING_ADVANCE_PERCENT,
  calculateAdvanceRequired,
  calculateOutstanding,
  canRequestBooking,
} from "@/lib/proforma-invoices";
import {
  canApproveBooking,
  canManageProformaInvoices,
  canRecordPayments,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import { ROLES } from "@/lib/rbac";

describe("proforma invoice calculations", () => {
  it("calculates 50% advance required", () => {
    expect(calculateAdvanceRequired(100000)).toBe(50000);
    expect(BOOKING_ADVANCE_PERCENT).toBe(50);
  });

  it("calculates outstanding as PI value minus payments", () => {
    expect(calculateOutstanding(100000, 40000)).toBe(60000);
    expect(calculateOutstanding(100000, 120000)).toBe(0);
  });

  it("allows booking only when advance is met", () => {
    expect(canRequestBooking(100000, 50000)).toBe(true);
    expect(canRequestBooking(100000, 49999)).toBe(false);
  });
});

describe("proforma invoice permissions", () => {
  it("allows sales and accounts to view", () => {
    expect(canViewProformaInvoices([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewProformaInvoices([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewProformaInvoices([ROLES.PURCHASE])).toBe(false);
  });

  it("allows sales to manage and accounts to record payments", () => {
    expect(canManageProformaInvoices([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canRecordPayments([ROLES.ACCOUNTS])).toBe(true);
    expect(canRecordPayments([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows manager to approve booking", () => {
    expect(canApproveBooking([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApproveBooking([ROLES.SALES_EXECUTIVE])).toBe(false);
  });
});
