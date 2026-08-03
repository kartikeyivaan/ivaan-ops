import type { NextAuthConfig } from "next-auth";
import { getPasswordChangeRequirement } from "@/lib/password-policy";
import { PRACTICE_COMPANY_CODE } from "@/lib/learning/lessons";

type SessionCompany = {
  id: string;
  name: string;
  code: string;
  isPractice?: boolean;
};

function isPractice(company: SessionCompany | undefined): boolean {
  if (!company) return false;
  return Boolean(company.isPractice) || company.code === PRACTICE_COMPANY_CODE;
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
        token.companies = user.companies as SessionCompany[];
        token.activeCompanyId = user.activeCompanyId as string | null;
        token.mustChangePassword = user.mustChangePassword as boolean;
        token.passwordChangedAt = user.passwordChangedAt as string | null;
        token.learningMode = false;
        token.learningReturnCompanyId = null;
      }

      if (trigger === "update" && session) {
        if (Array.isArray(session.companies)) {
          token.companies = session.companies as SessionCompany[];
        }

        if (typeof session.learningMode === "boolean") {
          token.learningMode = session.learningMode;
        }

        if (session.learningReturnCompanyId !== undefined) {
          token.learningReturnCompanyId =
            (session.learningReturnCompanyId as string | null) ?? null;
        }

        if (session.activeCompanyId) {
          const companies = (token.companies as SessionCompany[]) ?? [];
          const companyIds = companies.map((c) => c.id);
          if (companyIds.includes(session.activeCompanyId)) {
            token.activeCompanyId = session.activeCompanyId;
          }
        }

        if (session.passwordUpdated) {
          token.mustChangePassword = false;
          token.passwordChangedAt = new Date().toISOString();
        }
      }

      // Safety: never stay on Practice without Learning Mode.
      if (!token.learningMode) {
        const companies = (token.companies as SessionCompany[]) ?? [];
        const active = companies.find((c) => c.id === token.activeCompanyId);
        if (isPractice(active)) {
          const fallback =
            companies.find((c) => !isPractice(c))?.id ?? null;
          token.activeCompanyId = fallback;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = token.roles as string[];
        session.user.companies = (token.companies as SessionCompany[]) ?? [];
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
