import { describe, expect, it } from "vitest";
import { getRemainingQty } from "@/lib/dispatches";
import {
  canApproveDispatchCancel,
  canManageDispatches,
  canViewDispatches,
} from "@/lib/dispatch-permissions";
import { ROLES } from "@/lib/rbac";

describe("dispatch helpers", () => {
  it("calculates remaining qty for partial dispatch", () => {
    expect(getRemainingQty(100, 40)).toBe(60);
    expect(getRemainingQty(100, 120)).toBe(0);
  });
});

describe("dispatch permissions", () => {
  it("allows warehouse and sales to view dispatches", () => {
    expect(canViewDispatches([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewDispatches([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewDispatches([ROLES.PURCHASE])).toBe(false);
  });

  it("allows warehouse to manage dispatches", () => {
    expect(canManageDispatches([ROLES.WAREHOUSE])).toBe(true);
    expect(canManageDispatches([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows manager to approve DC cancellation", () => {
    expect(canApproveDispatchCancel([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApproveDispatchCancel([ROLES.WAREHOUSE])).toBe(false);
  });
});
