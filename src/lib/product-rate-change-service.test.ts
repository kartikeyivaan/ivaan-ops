import { describe, expect, it } from "vitest";
import { validateRateChangeLines } from "@/lib/product-rate-change-service";

describe("validateRateChangeLines", () => {
  it("requires at least one line", () => {
    expect(validateRateChangeLines([])).toBe("Add at least one product line.");
  });

  it("blocks duplicate products", () => {
    expect(
      validateRateChangeLines([
        { productId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", standardPrice: 10, minimumPrice: 9 },
        { productId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", standardPrice: 11, minimumPrice: 10 },
      ]),
    ).toBe("Each product can appear only once in a batch.");
  });

  it("blocks minimum above standard", () => {
    expect(
      validateRateChangeLines([
        { productId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", standardPrice: 10, minimumPrice: 11 },
      ]),
    ).toBe("Minimum price cannot exceed standard price.");
  });

  it("accepts valid lines", () => {
    expect(
      validateRateChangeLines([
        { productId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", standardPrice: 10, minimumPrice: 9 },
      ]),
    ).toBeNull();
  });
});
