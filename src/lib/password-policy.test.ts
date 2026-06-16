import { describe, expect, it } from "vitest";
import {
  getPasswordChangeRequirement,
  getPasswordStrengthIssues,
  isPasswordExpired,
  isStrongPassword,
  PASSWORD_MAX_AGE_DAYS,
} from "@/lib/password-policy";

describe("password-policy", () => {
  it("requires first-login password change", () => {
    const result = getPasswordChangeRequirement({
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    });
    expect(result).toEqual({ required: true, reason: "FIRST_LOGIN" });
  });

  it("requires change after 30 days", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - PASSWORD_MAX_AGE_DAYS);

    expect(isPasswordExpired(oldDate)).toBe(true);
    expect(
      getPasswordChangeRequirement({
        mustChangePassword: false,
        passwordChangedAt: oldDate,
      }),
    ).toEqual({ required: true, reason: "EXPIRED" });
  });

  it("accepts a strong password", () => {
    expect(isStrongPassword("Admin@123")).toBe(true);
    expect(getPasswordStrengthIssues("Admin@123")).toEqual([]);
  });

  it("rejects weak passwords", () => {
    expect(isStrongPassword("password")).toBe(false);
    expect(getPasswordStrengthIssues("password").length).toBeGreaterThan(0);
  });
});
