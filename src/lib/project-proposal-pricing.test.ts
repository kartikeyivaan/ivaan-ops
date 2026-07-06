import { describe, expect, it } from "vitest";
import {
  ProposalBuildingType,
  ProposalConnectionPhase,
  ProposalStructureType,
} from "@prisma/client";
import {
  BRAND_UPGRADE_CHARGE,
  DISCOUNT_APPROVAL_THRESHOLD,
  SUBSIDY_AMOUNT,
  THREE_PHASE_CHARGE,
  backCalculateGstForPdf,
  calculateBrandUpgradeAmount,
  calculateExtraFloorAmount,
  calculateFutureStructureAmount,
  calculateNdcrPanelAmount,
  calculateDcrPanelAmount,
  calculateProjectProposalPricing,
  calculateStructureAdjustmentAmount,
  calculateSubsidyEstimate,
} from "@/lib/project-proposal-pricing";

const basePackage = {
  code: "P2",
  panelWp: 570,
  panelCount: 6,
  systemKw: 3.3,
  basePrice: 195_000,
  isActive: true,
  isComingSoon: false,
};

const polycabBrand = {
  code: "POLYCAB",
  name: "Polycab",
  brandUpgradeAmount: 0,
  isActive: true,
  isComingSoon: false,
};

const waareeBrand = {
  code: "WAAREE",
  name: "Waaree",
  brandUpgradeAmount: 5_000,
  isActive: true,
  isComingSoon: false,
};

const solaredgeBrand = {
  code: "SOLAREDGE",
  name: "SolarEdge",
  brandUpgradeAmount: 5_000,
  isActive: true,
  isComingSoon: false,
};

function buildInput(
  overrides: Partial<Parameters<typeof calculateProjectProposalPricing>[0]> = {},
) {
  return {
    package: basePackage,
    connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
    inverterBrands: [polycabBrand],
    inverterUpgrade: null,
    structureType: ProposalStructureType.CUSTOM_FABRICATED,
    buildingType: ProposalBuildingType.BUNGALOW,
    extraFloors: 0,
    ndcrAdditionalPanels: 0,
    dcrAdditionalPanels: 0,
    futureStructurePanels: 0,
    discountAmount: 0,
    additionalCostAmount: 0,
    ...overrides,
  };
}

describe("project proposal pricing", () => {
  it("calculates base package with no add-ons", () => {
    const result = calculateProjectProposalPricing(buildInput());

    expect(result.basePackageAmount).toBe(195_000);
    expect(result.finalAmount).toBe(195_000);
    expect(result.subsidyEstimate).toBe(SUBSIDY_AMOUNT);
    expect(result.effectiveCustomerInvestment).toBe(195_000 - SUBSIDY_AMOUNT);
    expect(result.requiresManagerApproval).toBe(false);
  });

  it("applies three phase charge once", () => {
    const result = calculateProjectProposalPricing(
      buildInput({ connectionPhase: ProposalConnectionPhase.THREE_PHASE }),
    );

    expect(result.threePhaseAmount).toBe(THREE_PHASE_CHARGE);
    expect(result.finalAmount).toBe(195_000 + THREE_PHASE_CHARGE);
  });

  it("applies brand upgrade only once for Waaree or SolarEdge", () => {
    expect(calculateBrandUpgradeAmount([polycabBrand])).toBe(0);
    expect(calculateBrandUpgradeAmount([waareeBrand])).toBe(BRAND_UPGRADE_CHARGE);
    expect(calculateBrandUpgradeAmount([waareeBrand, solaredgeBrand])).toBe(
      BRAND_UPGRADE_CHARGE,
    );

    const result = calculateProjectProposalPricing(
      buildInput({ inverterBrands: [waareeBrand, solaredgeBrand] }),
    );
    expect(result.brandUpgradeAmount).toBe(5_000);
  });

  it("calculates structure adjustments per system kW", () => {
    expect(
      calculateStructureAdjustmentAmount(
        ProposalStructureType.CUSTOM_FABRICATED,
        3.3,
      ),
    ).toBe(0);
    expect(
      calculateStructureAdjustmentAmount(ProposalStructureType.PREFAB_C_CHANNEL, 3.3),
    ).toBe(1_650);
    expect(
      calculateStructureAdjustmentAmount(ProposalStructureType.MONO_RAIL, 3.3),
    ).toBe(-6_600);
  });

  it("charges only for extra floors above two", () => {
    expect(calculateExtraFloorAmount(0)).toBe(0);
    expect(calculateExtraFloorAmount(2)).toBe(4_000);
  });

  it("calculates future structure, NDCR and DCR panel costs", () => {
    expect(calculateFutureStructureAmount(2)).toBe(6_000);
    expect(calculateNdcrPanelAmount(570, 1)).toBe(11_500);
    expect(calculateNdcrPanelAmount(530, 2)).toBe(0);
    expect(calculateDcrPanelAmount(570, 1)).toBe(17_000);
    expect(calculateDcrPanelAmount(530, 2)).toBe(30_000);
    expect(calculateDcrPanelAmount(520, 1)).toBe(0);
  });

  it("flags manager approval when discount exceeds threshold", () => {
    const result = calculateProjectProposalPricing(
      buildInput({ discountAmount: DISCOUNT_APPROVAL_THRESHOLD + 1 }),
    );

    expect(result.requiresManagerApproval).toBe(true);
    expect(result.finalAmount).toBe(195_000 - (DISCOUNT_APPROVAL_THRESHOLD + 1));
  });

  it("applies full PRD formula with inverter upgrade and discount", () => {
    const result = calculateProjectProposalPricing(
      buildInput({
        connectionPhase: ProposalConnectionPhase.THREE_PHASE,
        inverterBrands: [waareeBrand],
        inverterUpgrade: {
          packagePanelCount: 6,
          upgradeKw: 5,
          upgradeAmount: 15_000,
          isActive: true,
        },
        structureType: ProposalStructureType.PREFAB_C_CHANNEL,
        extraFloors: 1,
        ndcrAdditionalPanels: 1,
        futureStructurePanels: 1,
        discountAmount: 3_000,
      }),
    );

    expect(result.subtotalBeforeDiscount).toBe(
      195_000 + 5_000 + 15_000 + 25_000 + 1_650 + 2_000 + 3_000 + 11_500,
    );
    expect(result.finalAmount).toBe(result.subtotalBeforeDiscount - 3_000);
  });

  it("adds additional cost after discount", () => {
    const result = calculateProjectProposalPricing(
      buildInput({ discountAmount: 2_000, additionalCostAmount: 5_000 }),
    );

    expect(result.finalAmount).toBe(195_000 - 2_000 + 5_000);
  });

  it("does not grant subsidy below 3kW systems", () => {
    expect(calculateSubsidyEstimate(2.5)).toBe(0);
    expect(calculateSubsidyEstimate(3)).toBe(SUBSIDY_AMOUNT);
  });

  it("back-calculates GST split for PDF only", () => {
    const gst = backCalculateGstForPdf(247_500);

    expect(gst.bucketAt5Percent).toBe(173_250);
    expect(gst.bucketAt18Percent).toBe(74_250);
    expect(gst.grandTotal).toBe(247_500);
    expect(gst.totalTaxable + gst.totalGst).toBeCloseTo(247_500, 2);
  });

  it("calculates NDCR complete project with no base price or subsidy", () => {
    const result = calculateProjectProposalPricing(
      buildInput({
        package: {
          ...basePackage,
          code: "NDCR_COMPLETE",
          panelWp: 0,
          panelCount: 0,
          systemKw: 0,
          basePrice: 0,
        },
        ndcrComplete: true,
        inverterCapacityKw: 5,
        additionalCostAmount: 250_000,
      }),
    );

    expect(result.basePackageAmount).toBe(0);
    expect(result.subsidyEstimate).toBe(0);
    expect(result.systemKw).toBe(5);
    expect(result.subtotalBeforeDiscount).toBe(0);
    expect(result.finalAmount).toBe(250_000);
  });
});
