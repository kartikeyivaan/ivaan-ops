import { describe, expect, it } from "vitest";
import {
  canEditCustomers,
  canReassignCustomers,
  canViewCustomers,
} from "@/lib/customer-permissions";
import {
  calculateCustomerOutstanding,
  isValidGstFormat,
  normalizeGstNumber,
} from "@/lib/customers";
import { ROLES } from "@/lib/rbac";

describe("customers", () => {
  it("normalizes GST numbers", () => {
    expect(normalizeGstNumber(" 27aabci1234a1z5 ")).toBe("27AABCI1234A1Z5");
  });

  it("validates GST format", () => {
    expect(isValidGstFormat("27AABCI1234A1Z5")).toBe(true);
    expect(isValidGstFormat("INVALID")).toBe(false);
  });

  it("returns outstanding placeholder until PI module exists", () => {
    const metrics = calculateCustomerOutstanding();
    expect(metrics.outstandingValue).toBe(0);
    expect(metrics.openPiCount).toBe(0);
  });
});

describe("customer permissions", () => {
  it("allows sales roles to edit customers", () => {
    expect(canEditCustomers([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canEditCustomers([ROLES.WAREHOUSE])).toBe(false);
  });

  it("allows manager and admin to reassign", () => {
    expect(canReassignCustomers([ROLES.SALES_MANAGER])).toBe(true);
    expect(canReassignCustomers([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows read-only roles to view customers", () => {
    expect(canViewCustomers([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewCustomers([ROLES.PURCHASE])).toBe(true);
  });
});
