/**
 * Companies left out of the monthly serial audit (demo and practice companies).
 * Matched by exact company name.
 */
export const MONTHLY_AUDIT_EXCLUDED_COMPANY_NAMES = ["Ivaan Demo", "Ivaan Practice"] as const;

/** Prisma filter for a Company relation, e.g. `company: monthlyAuditCompanyFilter`. */
export const monthlyAuditCompanyFilter = {
  name: { notIn: [...MONTHLY_AUDIT_EXCLUDED_COMPANY_NAMES] },
};

/** Prisma filter matching only the excluded companies (for dropping their records). */
export const monthlyAuditExcludedCompanyFilter = {
  name: { in: [...MONTHLY_AUDIT_EXCLUDED_COMPANY_NAMES] },
};
