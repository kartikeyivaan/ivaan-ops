import { describe, expect, it } from "vitest";
import {
  canViewAccountsStockTransfers,
  canViewInwardedLots,
  canViewPiPayments,
} from "@/lib/accounts-permissions";
import { ROLES } from "@/lib/rbac";

describe("accounts permissions", () => {
  it("allows accounts and super admin to view inwarded lots", () => {
    expect(canViewInwardedLots([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewInwardedLots([ROLES.SUPER_ADMIN])).toBe(true);
  });

  it("blocks other roles from the inwarded-lots accounts view", () => {
    expect(canViewInwardedLots([ROLES.WAREHOUSE])).toBe(false);
    expect(canViewInwardedLots([ROLES.PURCHASE])).toBe(false);
    expect(canViewInwardedLots([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("keeps other accounts views on the same roles", () => {
    expect(canViewAccountsStockTransfers([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewPiPayments([ROLES.ACCOUNTS])).toBe(true);
  });
});
