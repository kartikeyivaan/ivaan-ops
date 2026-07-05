import {
  ProposalBuildingType,
  ProposalConnectionPhase,
  ProposalStructureType,
} from "@prisma/client";
import { roundMoney } from "@/lib/quotations";

export const PROJECT_PROPOSAL_VALIDITY_DAYS = 5;
export const THREE_PHASE_CHARGE = 25_000;
export const BRAND_UPGRADE_CHARGE = 5_000;
export const DISCOUNT_APPROVAL_THRESHOLD = 5_000;
export const SUBSIDY_AMOUNT = 78_000;
export const SUBSIDY_MIN_SYSTEM_KW = 3;
export const NDCR_PANEL_CHARGE = 11_500;
export const NDCR_MIN_PANEL_WP = 570;
export const DCR_PANEL_CHARGE_570 = 17_000;
export const DCR_PANEL_CHARGE_530 = 15_000;
export const DCR_MIN_PANEL_WP = 530;
export const FUTURE_STRUCTURE_CHARGE_PER_PANEL = 3_000;
export const EXTRA_FLOOR_CHARGE = 2_000;
export const PREFAB_C_CHANNEL_PER_KW = 500;
export const MONO_RAIL_PER_KW = 2_000;

export const GST_SPLIT_LOW_RATE = 5;
export const GST_SPLIT_HIGH_RATE = 18;
export const GST_SPLIT_LOW_WEIGHT = 0.7;
export const GST_SPLIT_HIGH_WEIGHT = 0.3;

export type ProjectProposalBrandInput = {
  code: string;
  name: string;
  brandUpgradeAmount: number;
  isActive: boolean;
  isComingSoon: boolean;
};

export type ProjectProposalPackageInput = {
  code: string;
  panelWp: number;
  panelCount: number;
  systemKw: number;
  basePrice: number;
  isActive: boolean;
  isComingSoon: boolean;
};

export type ProjectProposalInverterUpgradeInput = {
  packagePanelCount: number;
  upgradeKw: number;
  upgradeAmount: number;
  isActive: boolean;
};

export type ProjectProposalPricingInput = {
  package: ProjectProposalPackageInput;
  connectionPhase: ProposalConnectionPhase;
  inverterBrands: ProjectProposalBrandInput[];
  inverterUpgrade: ProjectProposalInverterUpgradeInput | null;
  structureType: ProposalStructureType;
  buildingType: ProposalBuildingType;
  extraFloors: number;
  ndcrAdditionalPanels: number;
  dcrAdditionalPanels: number;
  futureStructurePanels: number;
  discountAmount: number;
  additionalCostAmount: number;
};

export type ProjectProposalGstPdfBreakdown = {
  bucketAt5Percent: number;
  bucketAt18Percent: number;
  taxableAt5Percent: number;
  gstAt5Percent: number;
  taxableAt18Percent: number;
  gstAt18Percent: number;
  totalTaxable: number;
  totalGst: number;
  grandTotal: number;
};

export type ProjectProposalPricingBreakdown = {
  basePackageAmount: number;
  brandUpgradeAmount: number;
  inverterUpgradeAmount: number;
  threePhaseAmount: number;
  structureAdjustmentAmount: number;
  extraFloorAmount: number;
  futureStructureAmount: number;
  ndcrPanelAmount: number;
  dcrPanelAmount: number;
  subtotalBeforeDiscount: number;
  discountAmount: number;
  additionalCostAmount: number;
  finalAmount: number;
  subsidyEstimate: number;
  effectiveCustomerInvestment: number;
  requiresManagerApproval: boolean;
  systemKw: number;
  panelWp: number;
  panelCount: number;
  pdfGst: ProjectProposalGstPdfBreakdown;
};

export function calculateBrandUpgradeAmount(
  inverterBrands: ProjectProposalBrandInput[],
): number {
  const hasPremiumBrand = inverterBrands.some(
    (brand) => brand.brandUpgradeAmount > 0,
  );
  return hasPremiumBrand ? BRAND_UPGRADE_CHARGE : 0;
}

export function calculateThreePhaseAmount(
  connectionPhase: ProposalConnectionPhase,
): number {
  return connectionPhase === ProposalConnectionPhase.THREE_PHASE
    ? THREE_PHASE_CHARGE
    : 0;
}

export function calculateStructureAdjustmentAmount(
  structureType: ProposalStructureType,
  systemKw: number,
): number {
  if (structureType === ProposalStructureType.CUSTOM_FABRICATED) {
    return 0;
  }
  if (structureType === ProposalStructureType.PREFAB_C_CHANNEL) {
    return roundMoney(systemKw * PREFAB_C_CHANNEL_PER_KW);
  }
  return roundMoney(systemKw * -MONO_RAIL_PER_KW);
}

export function calculateExtraFloorAmount(extraFloors: number): number {
  if (extraFloors <= 0) {
    return 0;
  }
  return roundMoney(extraFloors * EXTRA_FLOOR_CHARGE);
}

export function calculateFutureStructureAmount(futureStructurePanels: number): number {
  if (futureStructurePanels <= 0) {
    return 0;
  }
  return roundMoney(futureStructurePanels * FUTURE_STRUCTURE_CHARGE_PER_PANEL);
}

export function calculateNdcrPanelAmount(
  panelWp: number,
  ndcrAdditionalPanels: number,
): number {
  if (panelWp < NDCR_MIN_PANEL_WP || ndcrAdditionalPanels <= 0) {
    return 0;
  }
  return roundMoney(ndcrAdditionalPanels * NDCR_PANEL_CHARGE);
}

export function getDcrPanelCharge(panelWp: number): number {
  if (panelWp >= NDCR_MIN_PANEL_WP) {
    return DCR_PANEL_CHARGE_570;
  }
  if (panelWp >= DCR_MIN_PANEL_WP) {
    return DCR_PANEL_CHARGE_530;
  }
  return 0;
}

export function calculateDcrPanelAmount(
  panelWp: number,
  dcrAdditionalPanels: number,
): number {
  const charge = getDcrPanelCharge(panelWp);
  if (charge <= 0 || dcrAdditionalPanels <= 0) {
    return 0;
  }
  return roundMoney(dcrAdditionalPanels * charge);
}

export function calculateSubsidyEstimate(systemKw: number): number {
  return systemKw >= SUBSIDY_MIN_SYSTEM_KW ? SUBSIDY_AMOUNT : 0;
}

export function backCalculateGstForPdf(
  finalAmount: number,
): ProjectProposalGstPdfBreakdown {
  const bucketAt5Percent = roundMoney(finalAmount * GST_SPLIT_LOW_WEIGHT);
  const bucketAt18Percent = roundMoney(finalAmount * GST_SPLIT_HIGH_WEIGHT);
  const taxableAt5Percent = roundMoney(bucketAt5Percent / (1 + GST_SPLIT_LOW_RATE / 100));
  const gstAt5Percent = roundMoney(bucketAt5Percent - taxableAt5Percent);
  const taxableAt18Percent = roundMoney(
    bucketAt18Percent / (1 + GST_SPLIT_HIGH_RATE / 100),
  );
  const gstAt18Percent = roundMoney(bucketAt18Percent - taxableAt18Percent);
  const totalTaxable = roundMoney(taxableAt5Percent + taxableAt18Percent);
  const totalGst = roundMoney(gstAt5Percent + gstAt18Percent);

  return {
    bucketAt5Percent,
    bucketAt18Percent,
    taxableAt5Percent,
    gstAt5Percent,
    taxableAt18Percent,
    gstAt18Percent,
    totalTaxable,
    totalGst,
    grandTotal: finalAmount,
  };
}

export function calculateProjectProposalPricing(
  input: ProjectProposalPricingInput,
): ProjectProposalPricingBreakdown {
  const systemKw = input.package.systemKw;
  const basePackageAmount = roundMoney(input.package.basePrice);
  const brandUpgradeAmount = calculateBrandUpgradeAmount(input.inverterBrands);
  const inverterUpgradeAmount = roundMoney(input.inverterUpgrade?.upgradeAmount ?? 0);
  const threePhaseAmount = calculateThreePhaseAmount(input.connectionPhase);
  const structureAdjustmentAmount = calculateStructureAdjustmentAmount(
    input.structureType,
    systemKw,
  );
  const extraFloorAmount = calculateExtraFloorAmount(input.extraFloors);
  const futureStructureAmount = calculateFutureStructureAmount(
    input.futureStructurePanels,
  );
  const ndcrPanelAmount = calculateNdcrPanelAmount(
    input.package.panelWp,
    input.ndcrAdditionalPanels,
  );
  const dcrPanelAmount = calculateDcrPanelAmount(
    input.package.panelWp,
    input.dcrAdditionalPanels,
  );
  const discountAmount = roundMoney(Math.max(0, input.discountAmount));
  const additionalCostAmount = roundMoney(Math.max(0, input.additionalCostAmount));

  const subtotalBeforeDiscount = roundMoney(
    basePackageAmount +
      brandUpgradeAmount +
      inverterUpgradeAmount +
      threePhaseAmount +
      structureAdjustmentAmount +
      extraFloorAmount +
      futureStructureAmount +
      ndcrPanelAmount +
      dcrPanelAmount,
  );

  const finalAmount = roundMoney(
    Math.max(0, subtotalBeforeDiscount - discountAmount + additionalCostAmount),
  );
  const subsidyEstimate = calculateSubsidyEstimate(systemKw);
  const effectiveCustomerInvestment = roundMoney(
    Math.max(0, finalAmount - subsidyEstimate),
  );

  return {
    basePackageAmount,
    brandUpgradeAmount,
    inverterUpgradeAmount,
    threePhaseAmount,
    structureAdjustmentAmount,
    extraFloorAmount,
    futureStructureAmount,
    ndcrPanelAmount,
    dcrPanelAmount,
    subtotalBeforeDiscount,
    discountAmount,
    additionalCostAmount,
    finalAmount,
    subsidyEstimate,
    effectiveCustomerInvestment,
    requiresManagerApproval: discountAmount > DISCOUNT_APPROVAL_THRESHOLD,
    systemKw,
    panelWp: input.package.panelWp,
    panelCount: input.package.panelCount,
    pdfGst: backCalculateGstForPdf(finalAmount),
  };
}

export type ProjectProposalRevisionPricingSnapshot = {
  basePackageAmount: number;
  brandUpgradeAmount: number;
  inverterUpgradeAmount: number;
  threePhaseAmount: number;
  structureAdjustmentAmount: number;
  extraFloorAmount: number;
  futureStructureAmount: number;
  ndcrPanelAmount: number;
  dcrPanelAmount: number;
  discountAmount: number;
  additionalCostAmount: number;
  subsidyEstimate: number;
  finalAmount: number;
  effectiveCustomerInvestment: number;
};

export function toRevisionPricingSnapshot(
  breakdown: ProjectProposalPricingBreakdown,
): ProjectProposalRevisionPricingSnapshot {
  return {
    basePackageAmount: breakdown.basePackageAmount,
    brandUpgradeAmount: breakdown.brandUpgradeAmount,
    inverterUpgradeAmount: breakdown.inverterUpgradeAmount,
    threePhaseAmount: breakdown.threePhaseAmount,
    structureAdjustmentAmount: breakdown.structureAdjustmentAmount,
    extraFloorAmount: breakdown.extraFloorAmount,
    futureStructureAmount: breakdown.futureStructureAmount,
    ndcrPanelAmount: breakdown.ndcrPanelAmount,
    dcrPanelAmount: breakdown.dcrPanelAmount,
    discountAmount: breakdown.discountAmount,
    additionalCostAmount: breakdown.additionalCostAmount,
    subsidyEstimate: breakdown.subsidyEstimate,
    finalAmount: breakdown.finalAmount,
    effectiveCustomerInvestment: breakdown.effectiveCustomerInvestment,
  };
}
