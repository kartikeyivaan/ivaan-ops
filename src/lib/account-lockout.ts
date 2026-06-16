import { ROLES } from "@/lib/rbac";

export const MAX_FAILED_LOGIN_ATTEMPTS = 3;

export const ADMIN_LOCKOUT_BLOCK_SIZE = 3;

export const ADMIN_LOCKOUT_ESCALATIONS = [
  { totalFailures: 3, lockMinutes: 15 },
  { totalFailures: 6, lockMinutes: 60 },
  { totalFailures: 9, lockMinutes: 600 },
  { totalFailures: 12, lockMinutes: null },
] as const;

export type LoginErrorCode =
  | "ACCOUNT_LOCKED"
  | "INVALID_CREDENTIALS"
  | "ADMIN_INVALID_CREDENTIALS"
  | "TIME_LOCKED"
  | "OTHER";

export function isPrivilegedLockoutUser(roles: string[]): boolean {
  return roles.includes(ROLES.SUPER_ADMIN);
}

export function getRemainingLoginAttempts(failedAttempts: number): number {
  return Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - failedAttempts);
}

export function shouldLockAccount(nextFailedAttempts: number): boolean {
  return nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
}

export function getAdminLockoutEscalation(totalFailures: number) {
  return ADMIN_LOCKOUT_ESCALATIONS.find(
    (escalation) => escalation.totalFailures === totalFailures,
  );
}

export function getAdminAttemptsUntilNextLock(failedAttempts: number): number {
  const nextEscalation = ADMIN_LOCKOUT_ESCALATIONS.find(
    (escalation) => escalation.totalFailures > failedAttempts,
  );
  if (!nextEscalation) {
    return 0;
  }
  return nextEscalation.totalFailures - failedAttempts;
}

export function isTemporarilyLocked(
  lockedUntil: Date | null | undefined,
  now = new Date(),
): boolean {
  return lockedUntil != null && lockedUntil > now;
}

export function getMinutesUntilUnlock(lockedUntil: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export function formatLoginErrorCode(
  code: Exclude<LoginErrorCode, "OTHER">,
  value?: number,
): string {
  if (code === "ACCOUNT_LOCKED") {
    return "ACCOUNT_LOCKED";
  }
  if (code === "TIME_LOCKED" && value !== undefined) {
    return `TIME_LOCKED:${value}`;
  }
  if (code === "ADMIN_INVALID_CREDENTIALS" && value !== undefined) {
    return `ADMIN_INVALID_CREDENTIALS:${value}`;
  }
  if (code === "INVALID_CREDENTIALS" && value !== undefined) {
    return `INVALID_CREDENTIALS:${value}`;
  }
  return code;
}

export function parseLoginErrorCode(error: string | undefined): {
  code: LoginErrorCode;
  attemptsRemaining?: number;
  minutesRemaining?: number;
} {
  if (!error) {
    return { code: "OTHER" };
  }
  if (error === "ACCOUNT_LOCKED" || error.includes("account_locked")) {
    return { code: "ACCOUNT_LOCKED" };
  }
  if (error.startsWith("TIME_LOCKED:")) {
    const minutesRemaining = Number(error.split(":")[1]);
    return {
      code: "TIME_LOCKED",
      minutesRemaining: Number.isFinite(minutesRemaining) ? minutesRemaining : undefined,
    };
  }
  if (error.startsWith("ADMIN_INVALID_CREDENTIALS:")) {
    const attemptsRemaining = Number(error.split(":")[1]);
    return {
      code: "ADMIN_INVALID_CREDENTIALS",
      attemptsRemaining: Number.isFinite(attemptsRemaining) ? attemptsRemaining : undefined,
    };
  }
  if (error.startsWith("INVALID_CREDENTIALS:")) {
    const attemptsRemaining = Number(error.split(":")[1]);
    return {
      code: "INVALID_CREDENTIALS",
      attemptsRemaining: Number.isFinite(attemptsRemaining) ? attemptsRemaining : undefined,
    };
  }
  if (
    error === "INVALID_CREDENTIALS" ||
    error === "ADMIN_INVALID_CREDENTIALS" ||
    error === "CredentialsSignin"
  ) {
    return { code: "INVALID_CREDENTIALS" };
  }
  return { code: "OTHER" };
}

export function getLoginErrorMessage(
  code: LoginErrorCode,
  options?: { attemptsRemaining?: number; minutesRemaining?: number },
): string {
  const { attemptsRemaining, minutesRemaining } = options ?? {};

  if (code === "ACCOUNT_LOCKED") {
    return "Your account is permanently locked after repeated failed sign-in attempts. A Super Admin must reset your password to unlock it.";
  }
  if (code === "TIME_LOCKED") {
    if (minutesRemaining !== undefined) {
      return `Account temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.`;
    }
    return "Account temporarily locked. Please try again later.";
  }
  if (code === "ADMIN_INVALID_CREDENTIALS") {
    if (attemptsRemaining === 1) {
      return "Invalid email or password. 1 more failed attempt will trigger the next lockout period.";
    }
    if (attemptsRemaining !== undefined && attemptsRemaining > 1) {
      return `Invalid email or password. ${attemptsRemaining} failed attempts until the next lockout period.`;
    }
    return "Invalid email or password.";
  }
  if (code === "INVALID_CREDENTIALS") {
    if (attemptsRemaining === 1) {
      return "Invalid email or password. 1 attempt remaining before your account is locked.";
    }
    if (attemptsRemaining !== undefined && attemptsRemaining > 1) {
      return `Invalid email or password. ${attemptsRemaining} attempts remaining before your account is locked.`;
    }
    return "Invalid email or password, or account is inactive.";
  }
  return "Unable to sign in. Please try again.";
}
