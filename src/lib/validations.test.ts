import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  companySchema,
  loginSchema,
  userSchema,
  warehouseSchema,
} from "@/lib/validations";

describe("validations", () => {
  it("validates login input", () => {
    const result = loginSchema.safeParse({
      email: "admin@ivaansolar.com",
      password: "Admin@123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid login email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "Admin@123",
    });
    expect(result.success).toBe(false);
  });

  it("validates company input", () => {
    const result = companySchema.safeParse({
      name: "Ivaan Solar Energy",
      code: "ise",
      isActive: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("ISE");
    }
  });

  it("requires at least one role and company for users", () => {
    const result = userSchema.safeParse({
      name: "Test User",
      email: "test@ivaansolar.com",
      password: "Password123",
      status: "ACTIVE",
      roleIds: [],
      companyIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("validates warehouse input", () => {
    const result = warehouseSchema.safeParse({
      companyId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Jalgaon HO",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("requires matching passwords for change password", () => {
    const result = changePasswordSchema.safeParse({
      password: "Admin@123",
      confirmPassword: "Admin@456",
    });
    expect(result.success).toBe(false);
  });

  it("requires a strong password for admin reset", () => {
    const result = changePasswordSchema.safeParse({
      password: "weakpass",
      confirmPassword: "weakpass",
    });
    expect(result.success).toBe(false);
  });
});
