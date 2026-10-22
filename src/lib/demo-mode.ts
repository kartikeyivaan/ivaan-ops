import type { Session } from "next-auth";
import { ROLES } from "@/lib/rbac";

/** Live buyer-demo company code. */
export const DEMO_COMPANY_CODE = "DEMO";
export const DEMO_COMPANY_NAME = "Ivaan Demo";
/** Default seeded buyer login (Super Admin may create more demo users). */
export const DEMO_USER_EMAIL = "demo@ivaansolar.com";
/** Required label on every demo-company document (PDF, UI, notes). */
export const DEMO_COMPANY_RECORD_LABEL = "Demo Company Record";

export type DemoCompanyFields = {
  id?: string;
  code?: string | null;
  isDemo?: boolean | null;
  isPractice?: boolean | null;
};

function normalizedCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isDemoCompany(company: DemoCompanyFields | null | undefined): boolean {
  if (!company) return false;
  return Boolean(company.isDemo) || normalizedCode(company.code) === DEMO_COMPANY_CODE;
}

export function isDemoUser(session: Session | null | undefined): boolean {
  return Boolean(session?.user?.isDemo);
}

export function isDemoSession(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  if (session.user.isDemo) return true;
  const activeId = session.user.activeCompanyId;
  if (!activeId) return false;
  const active = (session.user.companies ?? []).find((c) => c.id === activeId);
  return isDemoCompany(active);
}

/** Operational firms for staff dashboards / All-companies (excludes practice + demo). */
export function staffOperationalCompanies<T extends DemoCompanyFields>(
  companies: T[],
): T[] {
  return companies.filter((c) => !isDemoCompany(c) && !c.isPractice);
}

export type DemoMembershipValidationInput = {
  isDemo: boolean;
  companyIds: string[];
  companies: Array<{ id: string; code: string; isDemo?: boolean | null; isPractice?: boolean | null }>;
  roleNames: string[];
};

/**
 * Enforces bidirectional isolation:
 * - Demo users only on demo companies; never Super Admin
 * - Staff users never on demo companies
 * - Mixed demo + live membership is rejected
 */
export function validateDemoUserCompanyMembership(
  input: DemoMembershipValidationInput,
): { ok: true; isDemo: boolean } | { ok: false; code: string; message: string } {
  const byId = new Map(input.companies.map((c) => [c.id, c]));
  const selected = input.companyIds.map((id) => byId.get(id)).filter(Boolean) as Array<{
    id: string;
    code: string;
    isDemo?: boolean | null;
    isPractice?: boolean | null;
  }>;

  if (selected.length !== input.companyIds.length) {
    return { ok: false, code: "INVALID_COMPANY", message: "One or more companies were not found." };
  }

  const demoSelected = selected.filter((c) => isDemoCompany(c));
  const liveSelected = selected.filter((c) => !isDemoCompany(c) && !c.isPractice);
  const practiceSelected = selected.filter((c) => Boolean(c.isPractice));

  if (demoSelected.length > 0 && (liveSelected.length > 0 || practiceSelected.length > 0)) {
    return {
      ok: false,
      code: "DEMO_COMPANY_MIXED",
      message: "Demo company cannot be combined with live or Learning practice companies.",
    };
  }

  const inferredDemo = demoSelected.length > 0 || input.isDemo;

  if (inferredDemo) {
    if (liveSelected.length > 0 || practiceSelected.length > 0) {
      return {
        ok: false,
        code: "DEMO_USER_LIVE_COMPANY",
        message: "Demo users can only be assigned to the Ivaan Demo company.",
      };
    }
    if (demoSelected.length === 0) {
      return {
        ok: false,
        code: "DEMO_USER_NO_DEMO_COMPANY",
        message: "Demo users must be assigned to the Ivaan Demo company.",
      };
    }
    if (input.roleNames.includes(ROLES.SUPER_ADMIN)) {
      return {
        ok: false,
        code: "DEMO_USER_SUPER_ADMIN",
        message: "Demo users cannot have Super Admin access.",
      };
    }
    return { ok: true, isDemo: true };
  }

  if (demoSelected.length > 0) {
    return {
      ok: false,
      code: "STAFF_DEMO_COMPANY",
      message: "Ivaan Demo is only for demo users.",
    };
  }

  return { ok: true, isDemo: false };
}
