import { describe, expect, it } from "vitest";
import {
  canViewAnyReport,
  canViewDispatchReport,
  canViewPaymentFollowupReport,
  canViewProductMovementReport,
  canViewReservedQtyReport,
  canViewSalesExecutiveReport,
  restrictSalesUserId,
} from "@/lib/report-permissions";
import { ROLES } from "@/lib/rbac";

describe("report-permissions", () => {
  it("allows sales roles to view sales executive report", () => {
    expect(canViewSalesExecutiveReport([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewSalesExecutiveReport([ROLES.WAREHOUSE])).toBe(false);
  });

  it("allows accounts to view payment follow-up", () => {
    expect(canViewPaymentFollowupReport([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewPaymentFollowupReport([ROLES.PURCHASE])).toBe(false);
  });

  it("allows warehouse and purchase to view product movement", () => {
    expect(canViewProductMovementReport([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewProductMovementReport([ROLES.PURCHASE])).toBe(true);
    expect(canViewProductMovementReport([ROLES.ACCOUNTS])).toBe(false);
  });

  it("allows reserved qty report for sales, warehouse, and purchase", () => {
    expect(canViewReservedQtyReport([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewReservedQtyReport([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewReservedQtyReport([ROLES.PURCHASE])).toBe(true);
    expect(canViewReservedQtyReport([ROLES.ACCOUNTS])).toBe(false);
  });

  it("allows dispatch report for sales and warehouse", () => {
    expect(canViewDispatchReport([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewDispatchReport([ROLES.PURCHASE])).toBe(false);
  });

  it("detects any report access", () => {
    expect(canViewAnyReport([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canViewAnyReport([ROLES.PURCHASE])).toBe(true);
  });

  it("restricts sales executive to own data", () => {
    expect(
      restrictSalesUserId([ROLES.SALES_EXECUTIVE], "exec-1", "exec-2"),
    ).toBe("exec-1");
    expect(
      restrictSalesUserId([ROLES.SALES_MANAGER], "exec-1", "exec-2"),
    ).toBe("exec-2");
  });
});
