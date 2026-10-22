import type { DefaultSession } from "next-auth";
import type { PasswordChangeReason } from "@/lib/password-policy";

type SessionCompany = {
  id: string;
  name: string;
  code: string;
  isPractice?: boolean;
  isDemo?: boolean;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      companies: SessionCompany[];
      activeCompanyId: string | null;
      passwordChangeRequired: boolean;
      passwordChangeReason: PasswordChangeReason | null;
      isDemo?: boolean;
      learningMode?: boolean;
      learningReturnCompanyId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    roles: string[];
    companies: SessionCompany[];
    activeCompanyId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: string | null;
    isDemo?: boolean;
    learningMode?: boolean;
    learningReturnCompanyId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    companies: SessionCompany[];
    activeCompanyId: string | null;
    mustChangePassword?: boolean;
    passwordChangedAt?: string | null;
    isDemo?: boolean;
    learningMode?: boolean;
    learningReturnCompanyId?: string | null;
  }
}
