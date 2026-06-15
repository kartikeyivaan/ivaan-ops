import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      companies: Array<{ id: string; name: string; code: string }>;
      activeCompanyId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    roles: string[];
    companies: Array<{ id: string; name: string; code: string }>;
    activeCompanyId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    companies: Array<{ id: string; name: string; code: string }>;
    activeCompanyId: string | null;
  }
}
