import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import {
  AccountLockedError,
  AccountTemporarilyLockedError,
  InvalidLoginError,
} from "@/lib/auth-errors";
import {
  getAdminAttemptsUntilNextLock,
  getAdminLockoutEscalation,
  getMinutesUntilUnlock,
  getRemainingLoginAttempts,
  isPrivilegedLockoutUser,
  isTemporarilyLocked,
  shouldLockAccount,
} from "@/lib/account-lockout";
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

        const raw = credentials as Record<string, unknown> | undefined;
        const normalizedCredentials = {
          email:
            typeof raw?.email === "string"
              ? raw.email
              : typeof (raw?.email as { value?: unknown } | undefined)?.value === "string"
                ? (raw?.email as { value: string }).value
                : "",
          password:
            typeof raw?.password === "string"
              ? raw.password
              : typeof (raw?.password as { value?: unknown } | undefined)?.value === "string"
                ? (raw?.password as { value: string }).value
                : "",
        };

        const parsed = loginSchema.safeParse(normalizedCredentials);
        if (!parsed.success) {
          throw new InvalidLoginError();
        }

        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            roles: { include: { role: true } },
            companies: { include: { company: true } },
          },
        });

        if (!user) {
          throw new InvalidLoginError();
        }

        const roleNames = user.roles.map((entry) => entry.role.name);
        const privileged = isPrivilegedLockoutUser(roleNames);
        const now = new Date();

        if (user.status === UserStatus.LOCKED) {
          throw new AccountLockedError();
        }

        if (isTemporarilyLocked(user.lockedUntil, now)) {
          throw new AccountTemporarilyLockedError(
            getMinutesUntilUnlock(user.lockedUntil!, now),
          );
        }

        if (user.lockedUntil && user.lockedUntil <= now) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lockedUntil: null },
          });
        }

        if (user.status !== UserStatus.ACTIVE) {
          throw new InvalidLoginError();
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          const nextFailedAttempts = user.failedLoginAttempts + 1;

          if (privileged) {
            const escalation = getAdminLockoutEscalation(nextFailedAttempts);

            if (escalation) {
              const lockMinutes = escalation.lockMinutes;
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  failedLoginAttempts: nextFailedAttempts,
                  ...(lockMinutes === null
                    ? { status: UserStatus.LOCKED, lockedUntil: null }
                    : {
                        lockedUntil: new Date(now.getTime() + lockMinutes * 60_000),
                      }),
                },
              });

              await writeAuditLog({
                tableName: "users",
                recordId: user.id,
                action: "UPDATE",
                performedBy: user.id,
                newValue: {
                  email: user.email,
                  failedLoginAttempts: nextFailedAttempts,
                  ...(lockMinutes === null
                    ? {
                        status: UserStatus.LOCKED,
                        reason: "Permanent lock after repeated failed admin login attempts",
                      }
                    : {
                        lockedUntilMinutes: lockMinutes,
                        reason: "Temporary admin lockout after failed login attempts",
                      }),
                },
              });

              if (lockMinutes === null) {
                throw new AccountLockedError();
              }

              throw new AccountTemporarilyLockedError(lockMinutes);
            }

            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: nextFailedAttempts },
            });

            throw new InvalidLoginError(
              getAdminAttemptsUntilNextLock(nextFailedAttempts),
              true,
            );
          }

          if (shouldLockAccount(nextFailedAttempts)) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: nextFailedAttempts,
                status: UserStatus.LOCKED,
              },
            });

            await writeAuditLog({
              tableName: "users",
              recordId: user.id,
              action: "UPDATE",
              performedBy: user.id,
              newValue: {
                email: user.email,
                status: UserStatus.LOCKED,
                reason: "Account locked after repeated failed login attempts",
              },
            });

            throw new AccountLockedError();
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: nextFailedAttempts },
          });

          throw new InvalidLoginError(getRemainingLoginAttempts(nextFailedAttempts));
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });
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
        }).catch((error) => {
          console.error("[auth] LOGIN audit log failed:", error);
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: roleNames,
          companies: activeCompanies.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
          })),
          activeCompanyId: activeCompanies[0]?.id ?? null,
          mustChangePassword: user.mustChangePassword,
          passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
        };
      },
    }),
  ],
});
