import type { Session } from "next-auth";
import { PRACTICE_COMPANY_CODE } from "@/lib/learning/lessons";
import { getActiveCompanyId } from "@/lib/session";

/** Live Ivaan Solar Energy company code. */
export const ISE_COMPANY_CODE = "ISE";

export const PROJECTS_ISE_ONLY_MESSAGE =
  "Project proposals, projects and project dispatches are available only for Ivaan Solar Energy.";

export type CompanyScopeFields = {
  code?: string | null;
  name?: string | null;
  isPractice?: boolean | null;
};

function normalizedCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isIseCompany(company: CompanyScopeFields): boolean {
  return normalizedCode(company.code) === ISE_COMPANY_CODE;
}

export function isPracticeCompany(company: CompanyScopeFields): boolean {
  return Boolean(company.isPractice) || normalizedCode(company.code) === PRACTICE_COMPANY_CODE;
}

/** Projects module (proposals, execution projects, project DCs) — ISE, plus Practice sandbox. */
export function isProjectsCompany(company: CompanyScopeFields): boolean {
  return isIseCompany(company) || isPracticeCompany(company);
}

export function assertProjectsCompany(company: CompanyScopeFields | null | undefined): void {
  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }
  if (!isProjectsCompany(company)) {
    throw new Error("PROJECTS_ISE_ONLY");
  }
}

export function getActiveSessionCompany(session: Session | null) {
  const companyId = getActiveCompanyId(session);
  if (!companyId || !session?.user) return null;
  return session.user.companies.find((company) => company.id === companyId) ?? null;
}

export function requireProjectsCompany(session: Session | null): string {
  const company = getActiveSessionCompany(session);
  if (!company) {
    throw new Error("COMPANY_REQUIRED");
  }
  assertProjectsCompany(company);
  return company.id;
}

export function mapProjectsCompanySessionError(error: unknown): {
  code: string;
  message: string;
  status: number;
} | null {
  if (!(error instanceof Error)) return null;
  if (error.message === "COMPANY_REQUIRED") {
    return { code: "COMPANY_REQUIRED", message: "Select a company to continue.", status: 400 };
  }
  if (error.message === "PROJECTS_ISE_ONLY") {
    return { code: "PROJECTS_ISE_ONLY", message: PROJECTS_ISE_ONLY_MESSAGE, status: 403 };
  }
  return null;
}
