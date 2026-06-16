import { DefaultSession } from "next-auth";
import type { PasswordChangeReason } from "@/lib/password-policy";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      companies: Array<{ id: string; name: string; code: string }>;
      activeCompanyId: string | null;
      passwordChangeRequired: boolean;
      passwordChangeReason: PasswordChangeReason | null;
    } & DefaultSession["user"];
  }

  interface User {
    roles: string[];
    companies: Array<{ id: string; name: string; code: string }>;
    activeCompanyId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    companies: Array<{ id: string; name: string; code: string }>;
    activeCompanyId: string | null;
    mustChangePassword?: boolean;
    passwordChangedAt?: string | null;
  }
}
