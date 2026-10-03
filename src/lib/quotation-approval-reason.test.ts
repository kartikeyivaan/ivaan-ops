import { describe, expect, it } from "vitest";
import { CapacityUnit, PricingType } from "@prisma/client";
import {
  formatQuotationApprovalRate,
  formatQuotationPriceLineReason,
  formatShortProductNameForApproval,
  joinQuotationPriceLineReasons,
} from "@/lib/quotation-approval-reason";

describe("quotation approval reason formatting", () => {
  it("formats module short name as technology and Wp capacity", () => {
    expect(
      formatShortProductNameForApproval({
        displayName: "Modules - Longi - TOPCon - 590 Wp",
        pricingType: PricingType.WP,
        capacity: 590,
        capacityUnit: CapacityUnit.WP,
        categoryName: "Modules",
        brandName: "Longi",
        technologyName: "TOPCon",
      }),
    ).toBe("TOPCon 590Wp");
  });

  it("formats inverter short name as brand and capacity", () => {
    expect(
      formatShortProductNameForApproval({
        displayName: "Inverters - Growatt - 5 kW",
        pricingType: PricingType.UNIT,
        capacity: 5,
        capacityUnit: CapacityUnit.KW,
        categoryName: "Inverters",
        brandName: "Growatt",
        technologyName: null,
      }),
    ).toBe("Growatt - 5 kW");
  });

  it("uses display name for kit and other categories", () => {
    const kit = {
      displayName: "Kit - 5.9 kWp - Longi 590Wp ×10",
      pricingType: PricingType.UNIT,
      capacity: 1,
      capacityUnit: CapacityUnit.KW,
      categoryName: "Kit",
      brandName: "Ivaan",
      technologyName: null,
    };
    expect(formatShortProductNameForApproval(kit)).toBe(kit.displayName);
  });

  it("formats rates for WP vs unit pricing", () => {
    expect(formatQuotationApprovalRate(24.1, PricingType.WP)).toBe("24.10");
    expect(formatQuotationApprovalRate(45000.4, PricingType.UNIT)).toBe("45000");
  });

  it("builds a line reason and joins multiple lines", () => {
    const product = {
      displayName: "Modules - Longi - TOPCon - 590 Wp",
      pricingType: PricingType.WP,
      capacity: 590,
      capacityUnit: CapacityUnit.WP,
      categoryName: "Modules",
      brandName: "Longi",
      technologyName: "TOPCon",
    };
    expect(
      formatQuotationPriceLineReason({
        product,
        givenRate: 24.1,
        minimumRate: 24.5,
      }),
    ).toBe("TOPCon 590Wp - Given 24.10 Min 24.50");

    expect(
      joinQuotationPriceLineReasons([
        "TOPCon 590Wp - Given 24.10 Min 24.50",
        "Growatt - 5 kW - Given 45000 Min 47000",
      ]),
    ).toBe(
      "TOPCon 590Wp - Given 24.10 Min 24.50; Growatt - 5 kW - Given 45000 Min 47000",
    );
  });
});
