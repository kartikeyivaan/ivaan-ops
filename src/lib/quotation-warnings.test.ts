import { describe, expect, it } from "vitest";

import {
  evaluateCrossCompanyStockWarning,
  evaluatePcmNonModuleWarning,
  evaluateQuotationWarnings,
  isModuleCategory,
  isPcmCompany,
} from "@/lib/quotation-warnings";

const pcm = { id: "pcm", code: "PCMV", name: "PCM Ventures" };
const moduleItem = {
  productId: "module-1",
  sku: "MOD-590",
  categoryName: "Modules",
};
const inverterItem = {
  productId: "inverter-1",
  sku: "INV-5K",
  categoryName: "Inverters",
};

describe("quotation warnings", () => {
  it("recognises PCM by its seeded code or company name", () => {
    expect(isPcmCompany(pcm)).toBe(true);
    expect(
      isPcmCompany({ id: "pcm-2", name: "PCM Solar", code: null }),
    ).toBe(true);
    expect(
      isPcmCompany({ id: "pcm-3", name: "Solar Trading", code: "WEST-PCM-01" }),
    ).toBe(true);
    expect(
      isPcmCompany({ id: "ise", name: "Ivaan Solar Energy", code: "ISE" }),
    ).toBe(false);
  });

  it("recognises seeded and similarly named module categories", () => {
    expect(isModuleCategory("Modules")).toBe(true);
    expect(isModuleCategory("Solar Modules")).toBe(true);
    expect(isModuleCategory("Inverters")).toBe(false);
  });

  it("warns for PCM quotations containing a non-module item", () => {
    const warning = evaluatePcmNonModuleWarning(pcm, [
      moduleItem,
      inverterItem,
    ]);

    expect(warning).toMatchObject({
      type: "PCM_NON_MODULE",
      blocking: false,
      productIds: ["inverter-1"],
    });
    expect(warning?.message).toContain("non-module");
  });

  it("does not warn PCM for module-only quotations or other companies", () => {
    expect(evaluatePcmNonModuleWarning(pcm, [moduleItem])).toBeNull();
    expect(
      evaluatePcmNonModuleWarning(
        { id: "ise", name: "Ivaan Solar", code: "ISE" },
        [inverterItem],
      ),
    ).toBeNull();
  });

  it("warns when a permitted company has strictly higher stock", () => {
    const warning = evaluateCrossCompanyStockWarning(
      "pcm",
      [moduleItem],
      [
        {
          productId: "module-1",
          companyId: "pcm",
          companyName: "PCM Ventures",
          availableQuantity: 20,
        },
        {
          productId: "module-1",
          companyId: "ise",
          companyName: "Ivaan Solar",
          availableQuantity: 35,
        },
      ],
      ["pcm", "ise"],
    );

    expect(warning).toMatchObject({
      type: "CROSS_COMPANY_STOCK",
      blocking: false,
      productIds: ["module-1"],
      details: [
        {
          sku: "MOD-590",
          selectedCompanyAvailability: 20,
          otherCompanyId: "ise",
          otherCompanyAvailability: 35,
        },
      ],
    });
  });

  it("never exposes unauthorised companies and ignores equal stock", () => {
    const stock = [
      {
        productId: "module-1",
        companyId: "pcm",
        companyName: "PCM Ventures",
        availableQuantity: 20,
      },
      {
        productId: "module-1",
        companyId: "hidden",
        companyName: "Hidden Company",
        availableQuantity: 100,
      },
      {
        productId: "module-1",
        companyId: "equal",
        companyName: "Equal Company",
        availableQuantity: 20,
      },
    ];

    expect(
      evaluateCrossCompanyStockWarning(
        "pcm",
        [moduleItem],
        stock,
        ["pcm", "equal"],
      ),
    ).toBeNull();
  });

  it("aggregates availability across warehouses within each company", () => {
    const warning = evaluateCrossCompanyStockWarning(
      "pcm",
      [moduleItem],
      [
        {
          productId: "module-1",
          companyId: "pcm",
          companyName: "PCM Ventures",
          availableQuantity: 10,
        },
        {
          productId: "module-1",
          companyId: "pcm",
          companyName: "PCM Ventures",
          availableQuantity: 10,
        },
        {
          productId: "module-1",
          companyId: "ise",
          companyName: "Ivaan Solar",
          availableQuantity: 12,
        },
        {
          productId: "module-1",
          companyId: "ise",
          companyName: "Ivaan Solar",
          availableQuantity: 13,
        },
      ],
    );

    expect(warning?.details).toMatchObject([
      {
        selectedCompanyAvailability: 20,
        otherCompanyAvailability: 25,
      },
    ]);
  });

  it("returns all applicable non-blocking warnings together", () => {
    const warnings = evaluateQuotationWarnings({
      selectedCompany: pcm,
      items: [inverterItem],
      stockAvailability: [
        {
          productId: "inverter-1",
          companyId: "pcm",
          companyName: "PCM Ventures",
          availableQuantity: 0,
        },
        {
          productId: "inverter-1",
          companyId: "ise",
          companyName: "Ivaan Solar",
          availableQuantity: 5,
        },
      ],
      permittedCompanyIds: ["pcm", "ise"],
    });

    expect(warnings.map((warning) => warning.type)).toEqual([
      "PCM_NON_MODULE",
      "CROSS_COMPANY_STOCK",
    ]);
    expect(warnings.every((warning) => warning.blocking === false)).toBe(true);
  });
});
