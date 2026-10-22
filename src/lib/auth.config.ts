import type { NextAuthConfig } from "next-auth";
import { ALL_COMPANIES_ID, isAllCompaniesScope } from "@/lib/company-scope";
import { isDemoCompany } from "@/lib/demo-mode";
import { getPasswordChangeRequirement } from "@/lib/password-policy";
import { PRACTICE_COMPANY_CODE } from "@/lib/learning/lessons";

type SessionCompany = {
  id: string;
  name: string;
  code: string;
  isPractice?: boolean;
  isDemo?: boolean;
};

function isPractice(company: SessionCompany | undefined): boolean {
  if (!company) return false;
  return Boolean(company.isPractice) || company.code === PRACTICE_COMPANY_CODE;
}

function asCompanies(value: unknown): SessionCompany[] {
  return Array.isArray(value) ? (value as SessionCompany[]) : [];
}

function clampCompaniesForUser(
  companies: SessionCompany[],
  isDemoUser: boolean,
): SessionCompany[] {
  if (isDemoUser) {
    return companies.filter((c) => isDemoCompany(c) && !isPractice(c));
  }
  return companies.filter((c) => !isDemoCompany(c));
}

export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.roles = user.roles as string[];
        token.isDemo = Boolean(user.isDemo);
        token.companies = clampCompaniesForUser(
          asCompanies(user.companies),
          Boolean(user.isDemo),
        );
        token.activeCompanyId = user.activeCompanyId as string | null;
        token.mustChangePassword = user.mustChangePassword as boolean;
        token.passwordChangedAt = user.passwordChangedAt as string | null;
        token.learningMode = false;
        token.learningReturnCompanyId = null;
      }

      if (trigger === "update" && session) {
        if (Array.isArray(session.companies)) {
          token.companies = clampCompaniesForUser(
            asCompanies(session.companies),
            Boolean(token.isDemo),
          );
        }

        if (typeof session.learningMode === "boolean") {
          // Demo users cannot enter Learning Mode.
          token.learningMode = token.isDemo ? false : session.learningMode;
        }

        if (session.learningReturnCompanyId !== undefined) {
          token.learningReturnCompanyId = token.isDemo
            ? null
            : ((session.learningReturnCompanyId as string | null) ?? null);
        }

        if (session.activeCompanyId) {
          const companies = clampCompaniesForUser(
            asCompanies(token.companies),
            Boolean(token.isDemo),
          );
          const companyIds = companies.map((c) => c.id);
          if (token.isDemo) {
            // Demo users stay on their demo firm only (never All companies).
            if (companyIds.includes(session.activeCompanyId)) {
              token.activeCompanyId = session.activeCompanyId;
            } else if (companies[0]) {
              token.activeCompanyId = companies[0].id;
            }
          } else if (
            session.activeCompanyId === ALL_COMPANIES_ID ||
            companyIds.includes(session.activeCompanyId)
          ) {
            token.activeCompanyId = session.activeCompanyId;
          }
        }

        if (session.passwordUpdated) {
          token.mustChangePassword = false;
          token.passwordChangedAt = new Date().toISOString();
        }
      }

      const isDemoUser = Boolean(token.isDemo);
      token.companies = clampCompaniesForUser(asCompanies(token.companies), isDemoUser);

      if (isDemoUser) {
        token.learningMode = false;
        token.learningReturnCompanyId = null;
        const companies = asCompanies(token.companies);
        if (
          isAllCompaniesScope(token.activeCompanyId as string | null) ||
          !companies.some((c) => c.id === token.activeCompanyId)
        ) {
          token.activeCompanyId = companies[0]?.id ?? null;
        }
      } else if (!token.learningMode) {
        // Safety: never stay on Practice without Learning Mode.
        const companies = asCompanies(token.companies);
        if (!isAllCompaniesScope(token.activeCompanyId as string | null)) {
          const active = companies.find((c) => c.id === token.activeCompanyId);
          if (isPractice(active)) {
            const operational = companies.filter(
              (c) => !isPractice(c) && !isDemoCompany(c),
            );
            token.activeCompanyId =
              operational.length > 1
                ? ALL_COMPANIES_ID
                : (operational[0]?.id ?? null);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = Array.isArray(token.roles) ? (token.roles as string[]) : [];
        session.user.isDemo = Boolean(token.isDemo);
        session.user.companies = asCompanies(token.companies);
        session.user.activeCompanyId = token.activeCompanyId as string | null;

        const requirement = getPasswordChangeRequirement({
          mustChangePassword: Boolean(token.mustChangePassword),
          passwordChangedAt: token.passwordChangedAt
            ? new Date(token.passwordChangedAt as string)
            : null,
        });
        session.user.passwordChangeRequired = requirement.required;
        session.user.passwordChangeReason = requirement.reason;
        session.user.learningMode = Boolean(token.learningMode);
        session.user.learningReturnCompanyId =
          (token.learningReturnCompanyId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
