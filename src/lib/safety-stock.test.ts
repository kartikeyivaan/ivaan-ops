import { describe, expect, it } from "vitest";

import {
  DEFAULT_SAFETY_STOCK,
  resolveSafetyQty,
} from "@/lib/safety-stock";

describe("safety stock", () => {
  it("uses 100 when no override exists", () => {
    expect(DEFAULT_SAFETY_STOCK).toBe(100);
    expect(resolveSafetyQty(null)).toBe(100);
    expect(resolveSafetyQty(undefined)).toBe(100);
  });

  it("preserves an explicit override including zero", () => {
    expect(resolveSafetyQty(25)).toBe(25);
    expect(resolveSafetyQty(0)).toBe(0);
  });

  it("rejects invalid overrides", () => {
    expect(() => resolveSafetyQty(-1)).toThrow(RangeError);
    expect(() => resolveSafetyQty(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});
