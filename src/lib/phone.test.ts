import { describe, expect, it } from "vitest";
import { isValidIndianMobile, normalizeMobileNumber } from "@/lib/phone";

describe("normalizeMobileNumber", () => {
  it("keeps a bare 10-digit number", () => {
    expect(normalizeMobileNumber("9876543210")).toBe("9876543210");
  });

  it("strips +91 / 91 / leading 0 and spaces from pasted contacts", () => {
    expect(normalizeMobileNumber("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobileNumber("+91-98765-43210")).toBe("9876543210");
    expect(normalizeMobileNumber("91 9876543210")).toBe("9876543210");
    expect(normalizeMobileNumber("09876543210")).toBe("9876543210");
    expect(normalizeMobileNumber("0091 9876543210")).toBe("9876543210");
  });

  it("does not truncate while the user is still typing under 10 digits", () => {
    expect(normalizeMobileNumber("98765")).toBe("98765");
    expect(normalizeMobileNumber("+91")).toBe("91");
  });
});

describe("isValidIndianMobile", () => {
  it("accepts formatted and country-coded pastes", () => {
    expect(isValidIndianMobile("+91 98765 43210")).toBe(true);
    expect(isValidIndianMobile("98765 43210")).toBe(true);
  });

  it("rejects invalid local numbers", () => {
    expect(isValidIndianMobile("1234567890")).toBe(false);
    expect(isValidIndianMobile("98765")).toBe(false);
  });
});
