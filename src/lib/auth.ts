import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";
import { writeAuditLog } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!isDatabaseConfigured()) {
          throw new Error("DATABASE_NOT_CONFIGURED");
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: {
            roles: { include: { role: true } },
            companies: { include: { company: true } },
          },
        });

        if (!user || user.status !== UserStatus.ACTIVE) {
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          return null;
        }

        const activeCompanies = user.companies
          .map((uc) => uc.company)
          .filter((c) => c.isActive);

        await writeAuditLog({
          tableName: "users",
          recordId: user.id,
          action: "LOGIN",
          performedBy: user.id,
          newValue: { email: user.email },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles.map((ur) => ur.role.name),
          companies: activeCompanies.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
          })),
          activeCompanyId: activeCompanies[0]?.id ?? null,
        };
      },
    }),
  ],
});
