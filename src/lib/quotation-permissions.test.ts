import { describe, expect, it } from "vitest";
import {
  canApproveQuotationPricing,
  canManageQuotations,
  canManageQuotationsForCompany,
  canViewQuotations,
} from "@/lib/quotation-permissions";
import { ROLES } from "@/lib/rbac";

describe("quotation permissions", () => {
  it("allows sales roles and accounts to view quotations", () => {
    expect(canViewQuotations([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewQuotations([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewQuotations([ROLES.WAREHOUSE])).toBe(true);
  });

  it("blocks purchase from viewing quotations", () => {
    expect(canViewQuotations([ROLES.PURCHASE])).toBe(false);
  });

  it("allows sales roles to manage quotations", () => {
    expect(canManageQuotations([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canManageQuotations([ROLES.SALES_MANAGER])).toBe(true);
  });

  it("blocks warehouse and accounts from managing quotations", () => {
    expect(canManageQuotations([ROLES.WAREHOUSE])).toBe(false);
    expect(canManageQuotations([ROLES.ACCOUNTS])).toBe(false);
  });

  it("allows Super Admin to manage PCM quotations and blocks other sales roles", () => {
    const pcm = { id: "pcm", code: "PCMV", name: "PCM Ventures" };
    const ise = { id: "ise", code: "ISE", name: "Ivaan Solar Energy" };
    expect(canManageQuotationsForCompany([ROLES.SUPER_ADMIN], pcm)).toBe(true);
    expect(canManageQuotationsForCompany([ROLES.SALES_MANAGER], pcm)).toBe(false);
    expect(canManageQuotationsForCompany([ROLES.SALES_EXECUTIVE], pcm)).toBe(false);
    expect(canManageQuotationsForCompany([ROLES.SALES_EXECUTIVE], ise)).toBe(true);
  });

  it("allows sales manager and super admin to approve pricing", () => {
    expect(canApproveQuotationPricing([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApproveQuotationPricing([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canApproveQuotationPricing([ROLES.SALES_EXECUTIVE])).toBe(false);
  });
});
