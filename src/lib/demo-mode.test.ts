import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/rbac";
import {
  DEMO_COMPANY_CODE,
  isDemoCompany,
  staffOperationalCompanies,
  validateDemoUserCompanyMembership,
} from "@/lib/demo-mode";

describe("demo-mode", () => {
  const demo = { id: "d1", code: DEMO_COMPANY_CODE, isDemo: true };
  const ise = { id: "i1", code: "ISE", isDemo: false };
  const learn = { id: "l1", code: "LEARN", isPractice: true, isDemo: false };

  it("detects demo company by flag or code", () => {
    expect(isDemoCompany(demo)).toBe(true);
    expect(isDemoCompany({ code: "DEMO" })).toBe(true);
    expect(isDemoCompany(ise)).toBe(false);
  });

  it("filters staff operational companies", () => {
    expect(staffOperationalCompanies([demo, ise, learn])).toEqual([ise]);
  });

  it("allows demo-only membership", () => {
    const result = validateDemoUserCompanyMembership({
      isDemo: true,
      companyIds: [demo.id],
      companies: [demo, ise],
      roleNames: [ROLES.SALES_MANAGER],
    });
    expect(result).toEqual({ ok: true, isDemo: true });
  });

  it("rejects Super Admin on demo users", () => {
    const result = validateDemoUserCompanyMembership({
      isDemo: true,
      companyIds: [demo.id],
      companies: [demo],
      roleNames: [ROLES.SUPER_ADMIN],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DEMO_USER_SUPER_ADMIN");
  });

  it("rejects mixing demo and live", () => {
    const result = validateDemoUserCompanyMembership({
      isDemo: false,
      companyIds: [demo.id, ise.id],
      companies: [demo, ise],
      roleNames: [ROLES.SALES_MANAGER],
    });
    expect(result.ok).toBe(false);
  });

  it("infers demo user when only demo company is assigned", () => {
    const result = validateDemoUserCompanyMembership({
      isDemo: false,
      companyIds: [demo.id],
      companies: [demo],
      roleNames: [ROLES.SALES_MANAGER],
    });
    expect(result).toEqual({ ok: true, isDemo: true });
  });
});
