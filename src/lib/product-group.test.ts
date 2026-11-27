import { describe, expect, it } from "vitest";
import { isSameGroupProductSwapOnly, normalizeProductGroup } from "./product-group";

const groups = new Map<string, string | null>([
  ["p570", "Topcon-DCR 570/575/580/585/590"],
  ["p575", "topcon-dcr  570/575/580/585/590"],
  ["p610", "Topcon-DCR 610/615/620"],
  ["solo", null],
  ["solo2", "   "],
]);

describe("normalizeProductGroup", () => {
  it("treats blank and whitespace-only as no group and ignores case and extra spaces", () => {
    expect(normalizeProductGroup("   ")).toBeNull();
    expect(normalizeProductGroup(null)).toBeNull();
    expect(normalizeProductGroup(" Topcon-DCR  570/575 ")).toBe("topcon-dcr 570/575");
  });
});

describe("isSameGroupProductSwapOnly", () => {
  it("allows swapping products within the same group at the same qty and rate", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "p570", qty: 10, rate: 20 }],
        [{ productId: "p575", qty: 10, rate: 20 }],
        groups,
      ),
    ).toBe(true);
  });

  it("requires approval when the group changes", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "p570", qty: 10, rate: 20 }],
        [{ productId: "p610", qty: 10, rate: 20 }],
        groups,
      ),
    ).toBe(false);
  });

  it("requires approval for products with no group, even when swapping to another", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "solo", qty: 1, rate: 1 }],
        [{ productId: "solo2", qty: 1, rate: 1 }],
        groups,
      ),
    ).toBe(false);
  });

  it("keeps an unchanged ungrouped product as no change", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "solo", qty: 1, rate: 1 }],
        [{ productId: "solo", qty: 1, rate: 1 }],
        groups,
      ),
    ).toBe(true);
  });

  it("requires approval when qty or rate also changes", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "p570", qty: 10, rate: 20 }],
        [{ productId: "p575", qty: 11, rate: 20 }],
        groups,
      ),
    ).toBe(false);
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "p570", qty: 10, rate: 20 }],
        [{ productId: "p575", qty: 10, rate: 21 }],
        groups,
      ),
    ).toBe(false);
  });

  it("requires approval when a line is added or removed", () => {
    expect(
      isSameGroupProductSwapOnly(
        [{ productId: "p570", qty: 10, rate: 20 }],
        [
          { productId: "p575", qty: 10, rate: 20 },
          { productId: "p570", qty: 5, rate: 20 },
        ],
        groups,
      ),
    ).toBe(false);
  });

  it("matches lines regardless of order", () => {
    expect(
      isSameGroupProductSwapOnly(
        [
          { productId: "p570", qty: 10, rate: 20 },
          { productId: "p610", qty: 3, rate: 30 },
        ],
        [
          { productId: "p610", qty: 3, rate: 30 },
          { productId: "p575", qty: 10, rate: 20 },
        ],
        groups,
      ),
    ).toBe(true);
  });
});
