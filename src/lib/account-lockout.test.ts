import { describe, expect, it } from "vitest";
import {
  ADMIN_LOCKOUT_ESCALATIONS,
  formatLoginErrorCode,
  getAdminAttemptsUntilNextLock,
  getAdminLockoutEscalation,
  getLoginErrorMessage,
  getMinutesUntilUnlock,
  getRemainingLoginAttempts,
  isPrivilegedLockoutUser,
  isTemporarilyLocked,
  parseLoginErrorCode,
  shouldLockAccount,
} from "@/lib/account-lockout";
import { ROLES } from "@/lib/rbac";

describe("account-lockout", () => {
  it("identifies privileged lockout users", () => {
    expect(isPrivilegedLockoutUser([ROLES.SUPER_ADMIN])).toBe(true);
    expect(isPrivilegedLockoutUser([ROLES.SALES_MANAGER])).toBe(false);
  });

  it("locks regular users after 3 failed attempts", () => {
    expect(shouldLockAccount(3)).toBe(true);
    expect(shouldLockAccount(2)).toBe(false);
    expect(getRemainingLoginAttempts(2)).toBe(1);
  });

  it("escalates admin lockouts in 3-attempt blocks", () => {
    expect(getAdminLockoutEscalation(3)?.lockMinutes).toBe(15);
    expect(getAdminLockoutEscalation(6)?.lockMinutes).toBe(60);
    expect(getAdminLockoutEscalation(9)?.lockMinutes).toBe(600);
    expect(getAdminLockoutEscalation(12)?.lockMinutes).toBeNull();
    expect(ADMIN_LOCKOUT_ESCALATIONS).toHaveLength(4);
  });

  it("counts attempts until the next admin lockout", () => {
    expect(getAdminAttemptsUntilNextLock(0)).toBe(3);
    expect(getAdminAttemptsUntilNextLock(4)).toBe(2);
    expect(getAdminAttemptsUntilNextLock(11)).toBe(1);
  });

  it("detects active temporary locks", () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(isTemporarilyLocked(future)).toBe(true);
    expect(isTemporarilyLocked(past)).toBe(false);
    expect(getMinutesUntilUnlock(future)).toBeGreaterThan(0);
  });

  it("parses temporary lock and admin credential errors", () => {
    expect(parseLoginErrorCode("TIME_LOCKED:15")).toEqual({
      code: "TIME_LOCKED",
      minutesRemaining: 15,
    });
    expect(parseLoginErrorCode("ADMIN_INVALID_CREDENTIALS:2")).toEqual({
      code: "ADMIN_INVALID_CREDENTIALS",
      attemptsRemaining: 2,
    });
    expect(parseLoginErrorCode("ACCOUNT_LOCKED").code).toBe("ACCOUNT_LOCKED");
  });

  it("formats user-facing lockout messages", () => {
    expect(getLoginErrorMessage("TIME_LOCKED", { minutesRemaining: 15 })).toContain(
      "15 minutes",
    );
    expect(getLoginErrorMessage("ADMIN_INVALID_CREDENTIALS", { attemptsRemaining: 2 })).toContain(
      "2 failed attempts",
    );
    expect(formatLoginErrorCode("TIME_LOCKED", 60)).toBe("TIME_LOCKED:60");
  });
});
