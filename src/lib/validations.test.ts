import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  companySchema,
  createQuotationSchema,
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

  it("defaults new quotations to subject-to-availability delivery terms", () => {
    const result = createQuotationSchema.safeParse({
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      lines: [
        {
          productId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          qty: 1,
          rate: 100,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deliveryTermMode).toBe("SUBJECT_TO_AVAILABILITY");
      expect(result.data.proceedWithWarnings).toBe(false);
    }
  });

  it("validates advance-booking delivery fields", () => {
    const base = {
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      deliveryTermMode: "ADVANCE_BOOKING",
      requiredPaymentPercent: 30,
      dispatchMinDays: 8,
      dispatchMaxDays: 5,
      lines: [
        {
          productId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          qty: 1,
          rate: 100,
        },
      ],
    };

    expect(createQuotationSchema.safeParse(base).success).toBe(false);
    expect(
      createQuotationSchema.safeParse({
        ...base,
        dispatchMinDays: 5,
        dispatchMaxDays: 8,
      }).success,
    ).toBe(true);
  });
});
