import type { Session } from "next-auth";

export function getActiveCompanyId(session: Session | null): string | null {
  return session?.user?.activeCompanyId ?? null;
}

export function getSessionCompanyIds(session: Session | null): string[] {
  return session?.user?.companies?.map((company) => company.id) ?? [];
}

export function requireActiveCompany(session: Session | null): string {
  const companyId = getActiveCompanyId(session);
  if (!companyId) {
    throw new Error("COMPANY_REQUIRED");
  }
  return companyId;
}
