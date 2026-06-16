import type { NextAuthConfig } from "next-auth";
import { getPasswordChangeRequirement } from "@/lib/password-policy";

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
        token.companies = user.companies as Array<{
          id: string;
          name: string;
          code: string;
        }>;
        token.activeCompanyId = user.activeCompanyId as string | null;
        token.mustChangePassword = user.mustChangePassword as boolean;
        token.passwordChangedAt = user.passwordChangedAt as string | null;
      }

      if (trigger === "update" && session?.activeCompanyId) {
        const companyIds = (token.companies as Array<{ id: string }>).map(
          (c) => c.id,
        );
        if (companyIds.includes(session.activeCompanyId)) {
          token.activeCompanyId = session.activeCompanyId;
        }
      }

      if (trigger === "update" && session?.passwordUpdated) {
        token.mustChangePassword = false;
        token.passwordChangedAt = new Date().toISOString();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = token.roles as string[];
        session.user.companies = token.companies as Array<{
          id: string;
          name: string;
          code: string;
        }>;
        session.user.activeCompanyId = token.activeCompanyId as string | null;

        const requirement = getPasswordChangeRequirement({
          mustChangePassword: Boolean(token.mustChangePassword),
          passwordChangedAt: token.passwordChangedAt
            ? new Date(token.passwordChangedAt as string)
            : null,
        });
        session.user.passwordChangeRequired = requirement.required;
        session.user.passwordChangeReason = requirement.reason;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
