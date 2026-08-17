import { describe, expect, it } from "vitest";
import {
  describePartialDispatchLines,
  formatPartialDispatchConfirmMessage,
  getRemainingQty,
  isPartialDispatch,
} from "@/lib/dispatches";
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

  it("detects partial qty and omitted lines", () => {
    const lines = [
      { productName: "Panel", remainingQty: 10, qty: 6 },
      { productName: "Inverter", remainingQty: 2, qty: 0 },
      { productName: "Cable", remainingQty: 5, qty: 5 },
    ];

    expect(isPartialDispatch(lines)).toBe(true);
    expect(describePartialDispatchLines(lines)).toEqual([
      {
        productName: "Panel",
        dispatchQty: 6,
        remainingQty: 10,
        omitted: false,
      },
      {
        productName: "Inverter",
        dispatchQty: 0,
        remainingQty: 2,
        omitted: true,
      },
    ]);
  });

  it("returns false when every line dispatches full remaining qty", () => {
    const lines = [
      { productName: "Panel", remainingQty: 10, qty: 10 },
      { productName: "Cable", remainingQty: 5, qty: 5 },
    ];

    expect(isPartialDispatch(lines)).toBe(false);
    expect(describePartialDispatchLines(lines)).toEqual([]);
  });

  it("formats partial dispatch confirmation copy", () => {
    const message = formatPartialDispatchConfirmMessage([
      {
        productName: "Panel",
        dispatchQty: 6,
        remainingQty: 10,
        omitted: false,
      },
    ]);

    expect(message).toContain("partial dispatch");
    expect(message).toContain("Panel");
    expect(message).toContain("6 of 10");
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
