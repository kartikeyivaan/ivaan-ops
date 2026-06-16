import { describe, expect, it } from "vitest";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { canViewProformaInvoices } from "@/lib/pi-permissions";
import { canViewQuotations } from "@/lib/quotation-permissions";
import { canViewDispatches } from "@/lib/dispatch-permissions";
import { calculateOutstanding as calculatePiOutstanding } from "@/lib/proforma-invoices";
import { calculateOutstanding as calculateReportOutstanding } from "@/lib/reports";
import { getFinancialYear } from "@/lib/inventory";
import { ALL_ROLES, canAccessNav, NAV_ITEMS, ROLES } from "@/lib/rbac";

const COMPANY_ISE = "ise-company-id";
const COMPANY_PCMV = "pcmv-company-id";

describe("UAT — navigation matrix", () => {
  const restrictedForPurchase = [
    "/sales/quotations",
    "/sales/proforma-invoices",
    "/inventory/dispatches",
  ];

  it("allows all roles to access dashboard", () => {
    const dashboard = NAV_ITEMS.find((item) => item.href === "/dashboard")!;
    for (const role of ALL_ROLES) {
      expect(canAccessNav([role], dashboard)).toBe(true);
    }
  });

  it("blocks purchase from sales pipeline and dispatch nav", () => {
    for (const href of restrictedForPurchase) {
      const item = NAV_ITEMS.find((nav) => nav.href === href)!;
      expect(canAccessNav([ROLES.PURCHASE], item)).toBe(false);
    }
  });

  it("restricts admin nav to super admin only", () => {
    const adminRoutes = ["/admin/users", "/admin/companies", "/admin/audit"];
    for (const href of adminRoutes) {
      const item = NAV_ITEMS.find((nav) => nav.href === href)!;
      expect(canAccessNav([ROLES.SUPER_ADMIN], item)).toBe(true);
      expect(canAccessNav([ROLES.SALES_MANAGER], item)).toBe(false);
    }
  });

  it("allows sales manager to view warehouses admin page", () => {
    const warehouses = NAV_ITEMS.find((item) => item.href === "/admin/warehouses")!;
    expect(canAccessNav([ROLES.SALES_MANAGER], warehouses)).toBe(true);
    expect(canAccessNav([ROLES.WAREHOUSE], warehouses)).toBe(false);
  });

  it("allows purchase and super admin to access vendor management", () => {
    const purchase = NAV_ITEMS.find((item) => item.href === "/purchase")!;
    expect(canAccessNav([ROLES.PURCHASE], purchase)).toBe(true);
    expect(canAccessNav([ROLES.SUPER_ADMIN], purchase)).toBe(true);
    expect(canAccessNav([ROLES.WAREHOUSE], purchase)).toBe(false);
  });
});

describe("UAT — permission consistency", () => {
  it("aligns purchase restrictions across quotations, PI, and dispatch", () => {
    expect(canViewQuotations([ROLES.PURCHASE])).toBe(false);
    expect(canViewProformaInvoices([ROLES.PURCHASE])).toBe(false);
    expect(canViewDispatches([ROLES.PURCHASE])).toBe(false);
  });

  it("allows warehouse to view but not manage sales documents", () => {
    expect(canViewQuotations([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewProformaInvoices([ROLES.WAREHOUSE])).toBe(true);
    expect(canViewDispatches([ROLES.WAREHOUSE])).toBe(true);
  });
});

describe("UAT — business rule consistency", () => {
  it("uses same outstanding formula in PI and reports (BR-012)", () => {
    const piValue = 250000;
    const paid = 90000;
    expect(calculatePiOutstanding(piValue, paid)).toBe(
      calculateReportOutstanding(piValue, paid),
    );
    expect(calculatePiOutstanding(piValue, paid)).toBe(160000);
  });

  it("never returns negative outstanding", () => {
    expect(calculatePiOutstanding(50000, 80000)).toBe(0);
    expect(calculateReportOutstanding(50000, 80000)).toBe(0);
  });

  it("uses April–March financial year across document types", () => {
    const fy = getFinancialYear(new Date("2026-06-16"));
    expect(fy).toBe("26-27");
    expect(`ISE-QT-${fy}-00001`).toMatch(/^ISE-QT-\d{2}-\d{2}-\d{5}$/);
    expect(`ISE-PI-${fy}-00001`).toMatch(/^ISE-PI-\d{2}-\d{2}-\d{5}$/);
    expect(`ISE-DC-${fy}-00001`).toMatch(/^ISE-DC-\d{2}-\d{2}-\d{5}$/);
    expect(`TRF-${fy}-00001`).toMatch(/^TRF-\d{2}-\d{2}-\d{5}$/);
  });
});

describe("UAT — company access", () => {
  it("allows super admin to access any company", () => {
    expect(assertCompanyAccess([ROLES.SUPER_ADMIN], [], COMPANY_ISE)).toBe(true);
    expect(assertCompanyAccess([ROLES.SUPER_ADMIN], [], COMPANY_PCMV)).toBe(true);
  });

  it("restricts non-admin users to assigned companies", () => {
    expect(
      assertCompanyAccess([ROLES.SALES_EXECUTIVE], [COMPANY_ISE], COMPANY_ISE),
    ).toBe(true);
    expect(
      assertCompanyAccess([ROLES.SALES_EXECUTIVE], [COMPANY_ISE], COMPANY_PCMV),
    ).toBe(false);
  });
});
