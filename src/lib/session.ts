import type { Session } from "next-auth";
import { isAllCompaniesScope, requireAccessibleCompany } from "@/lib/company-scope";
import { operationalCompanies } from "@/lib/learning/mode";

export function getActiveCompanyId(session: Session | null): string | null {
  return session?.user?.activeCompanyId ?? null;
}

export function getSessionCompanyIds(session: Session | null): string[] {
  return session?.user?.companies?.map((company) => company.id) ?? [];
}

/**
 * Returns a concrete company UUID for mutations / single-company pages.
 * When "All companies" is selected, falls back to the first operational firm.
 */
export function requireActiveCompany(session: Session | null): string {
  const companyId = getActiveCompanyId(session);
  if (!companyId) {
    throw new Error("COMPANY_REQUIRED");
  }
  if (isAllCompaniesScope(companyId)) {
    const fallback = operationalCompanies(session?.user?.companies ?? [])[0]?.id;
    if (!fallback) {
      throw new Error("COMPANY_REQUIRED");
    }
    return fallback;
  }
  return companyId;
}

/**
 * Company for an approve/reject decision. The Approvals inbox passes the
 * record's own company as `?companyId=` so that "All companies" works; the
 * value is checked against the user's companies. Without it, falls back to
 * requireActiveCompany.
 */
export function requireApprovalCompany(session: Session | null, request: Request): string {
  const requested = new URL(request.url).searchParams.get("companyId");
  if (requested) {
    return requireAccessibleCompany(session, requested);
  }
  return requireActiveCompany(session);
}
