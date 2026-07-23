import { describe, expect, it, vi } from "vitest";
import {
  ProposalBuildingType,
  ProposalConnectionPhase,
  ProposalStructureType,
  type PrismaClient,
} from "@prisma/client";
import { ROLES } from "@/lib/rbac";
import {
  canAccessProjectProposal,
  restrictProjectProposalSalesUserId,
} from "@/lib/project-proposal-permissions";
import {
  BRAND_UPGRADE_CHARGE,
  DISCOUNT_APPROVAL_THRESHOLD,
  MONO_RAIL_PER_KW,
  PREFAB_C_CHANNEL_PER_KW,
  SUBSIDY_AMOUNT,
  THREE_PHASE_CHARGE,
  calculateExtraFloorAmount,
  calculateDcrPanelAmount,
  calculateNdcrPanelAmount,
  calculateProjectProposalPricing,
  calculateStructureAdjustmentAmount,
} from "@/lib/project-proposal-pricing";
import {
  getNextProjectProposalRevisionNo,
} from "@/lib/project-proposal-revision";
import { formatRevisionProposalLabel } from "@/lib/project-proposals";
import { resolveProjectProposalPricing } from "@/lib/project-proposal-service";
import {
  createProjectProposalSchema,
  projectProposalPricingSchema,
  rejectProjectProposalSchema,
} from "@/lib/validations";

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

const package530x6 = {
  code: "P1",
  panelWp: 530,
  panelCount: 6,
  systemKw: 3.3,
  basePrice: 185_000,
  isActive: true,
  isComingSoon: false,
};

const package570x6 = {
  code: "P2",
  panelWp: 570,
  panelCount: 6,
  systemKw: 3.3,
  basePrice: 195_000,
  isActive: true,
  isComingSoon: false,
};

const package610 = {
  code: "P610",
  panelWp: 610,
  panelCount: 6,
  systemKw: 3.3,
  basePrice: 0,
  isActive: false,
  isComingSoon: true,
};

function buildPricingInput(
  overrides: Partial<Parameters<typeof calculateProjectProposalPricing>[0]> = {},
) {
  return {
    package: package570x6,
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

function createMockPrisma(options: {
  pkg: {
    id: string;
    code: string;
    panelWp: number;
    panelCount: number;
    systemKw: number;
    basePrice: number;
    isActive: boolean;
    isComingSoon: boolean;
  };
  brands: Array<{
    code: string;
    name: string;
    brandUpgradeAmount: number;
    isActive: boolean;
    isComingSoon: boolean;
  }>;
}) {
  return {
    proposalPackageMaster: {
      findUnique: vi.fn().mockResolvedValue({
        ...options.pkg,
        id: options.pkg.id ?? "pkg-id",
      }),
    },
    proposalInverterBrandMaster: {
      findMany: vi.fn().mockResolvedValue(
        options.brands.map((brand) => ({
          id: `brand-${brand.code}`,
          sortOrder: 1,
          ...brand,
        })),
      ),
    },
    proposalInverterUpgradeMaster: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;
}

const validProposalPayload = {
  customerName: "Rahul Sharma",
  customerMobile: "9876543210",
  shortAddress: "Satellite, Ahmedabad",
  packageId: "11111111-1111-1111-1111-111111111111",
  connectionPhase: "SINGLE_PHASE" as const,
  inverterBrandCodes: ["POLYCAB"],
  structureType: "CUSTOM_FABRICATED" as const,
  buildingType: "BUNGALOW" as const,
  extraFloors: 0,
  ndcrAdditionalPanels: 0,
  dcrAdditionalPanels: 0,
  futureStructurePanels: 0,
  discountAmount: 0,
  additionalCostAmount: 0,
};

describe("Projects Proposal QA checklist", () => {
  it("1. 530 x 6 base package calculates ₹185000", () => {
    const result = calculateProjectProposalPricing(
      buildPricingInput({ package: package530x6 }),
    );

    expect(result.basePackageAmount).toBe(185_000);
    expect(result.finalAmount).toBe(185_000);
  });

  it("2. 570 x 6 base package calculates ₹195000", () => {
    const result = calculateProjectProposalPricing(buildPricingInput());

    expect(result.basePackageAmount).toBe(195_000);
    expect(result.finalAmount).toBe(195_000);
  });

  it("3. Waaree/SolarEdge adds ₹5000 once only", () => {
    const waareeOnly = calculateProjectProposalPricing(
      buildPricingInput({ inverterBrands: [waareeBrand] }),
    );
    const bothPremium = calculateProjectProposalPricing(
      buildPricingInput({ inverterBrands: [waareeBrand, solaredgeBrand] }),
    );

    expect(waareeOnly.brandUpgradeAmount).toBe(BRAND_UPGRADE_CHARGE);
    expect(bothPremium.brandUpgradeAmount).toBe(BRAND_UPGRADE_CHARGE);
  });

  it("4. Three Phase adds ₹25000", () => {
    const result = calculateProjectProposalPricing(
      buildPricingInput({ connectionPhase: ProposalConnectionPhase.THREE_PHASE }),
    );

    expect(result.threePhaseAmount).toBe(THREE_PHASE_CHARGE);
    expect(result.finalAmount).toBe(195_000 + THREE_PHASE_CHARGE);
  });

  it("5. C Channel adds ₹500 per kW", () => {
    const adjustment = calculateStructureAdjustmentAmount(
      ProposalStructureType.PREFAB_C_CHANNEL,
      3.3,
    );

    expect(adjustment).toBe(Math.round(3.3 * PREFAB_C_CHANNEL_PER_KW));
    expect(
      calculateProjectProposalPricing(
        buildPricingInput({ structureType: ProposalStructureType.PREFAB_C_CHANNEL }),
      ).structureAdjustmentAmount,
    ).toBe(1_650);
  });

  it("6. Mono Rail reduces ₹2000 per kW", () => {
    const adjustment = calculateStructureAdjustmentAmount(
      ProposalStructureType.MONO_RAIL,
      3.3,
    );

    expect(adjustment).toBe(Math.round(3.3 * -MONO_RAIL_PER_KW));
    expect(
      calculateProjectProposalPricing(
        buildPricingInput({ structureType: ProposalStructureType.MONO_RAIL }),
      ).structureAdjustmentAmount,
    ).toBe(-6_600);
  });

  it("7. Floor charge applies only above 2 floors", () => {
    expect(calculateExtraFloorAmount(0)).toBe(0);
    expect(calculateExtraFloorAmount(1)).toBe(2_000);
    expect(calculateExtraFloorAmount(2)).toBe(4_000);
  });

  it("8. NDCR panel allowed only for 570+ packages", async () => {
    expect(calculateNdcrPanelAmount(530, 2)).toBe(0);
    expect(calculateNdcrPanelAmount(570, 1)).toBe(11_500);

    const prisma530 = createMockPrisma({
      pkg: { id: "pkg-530", ...package530x6 },
      brands: [polycabBrand],
    });

    await expect(
      resolveProjectProposalPricing(prisma530, {
        packageId: "pkg-530",
        connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
        inverterBrandCodes: ["POLYCAB"],
        structureType: ProposalStructureType.CUSTOM_FABRICATED,
        buildingType: ProposalBuildingType.BUNGALOW,
        ndcrAdditionalPanels: 1,
      }),
    ).rejects.toThrow("NDCR_NOT_APPLICABLE");
  });

  it("8b. DCR panel allowed only for 530+ packages", async () => {
    expect(calculateDcrPanelAmount(520, 1)).toBe(0);
    expect(calculateDcrPanelAmount(530, 2)).toBe(30_000);
    expect(calculateDcrPanelAmount(570, 1)).toBe(17_000);

    const prisma520 = createMockPrisma({
      pkg: {
        id: "pkg-520",
        code: "520X6",
        panelWp: 520,
        panelCount: 6,
        systemKw: 3.12,
        basePrice: 180_000,
        isActive: true,
        isComingSoon: false,
      },
      brands: [polycabBrand],
    });

    await expect(
      resolveProjectProposalPricing(prisma520, {
        packageId: "pkg-520",
        connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
        inverterBrandCodes: ["POLYCAB"],
        structureType: ProposalStructureType.CUSTOM_FABRICATED,
        buildingType: ProposalBuildingType.BUNGALOW,
        dcrAdditionalPanels: 1,
      }),
    ).rejects.toThrow("DCR_NOT_APPLICABLE");
  });

  it("9. Discount above ₹5000 requires approval", () => {
    const withinLimit = calculateProjectProposalPricing(
      buildPricingInput({ discountAmount: DISCOUNT_APPROVAL_THRESHOLD }),
    );
    const aboveLimit = calculateProjectProposalPricing(
      buildPricingInput({ discountAmount: DISCOUNT_APPROVAL_THRESHOLD + 1 }),
    );

    expect(withinLimit.requiresManagerApproval).toBe(false);
    expect(aboveLimit.requiresManagerApproval).toBe(true);
  });

  it("10. Subsidy shows ₹78000 for 3kW+ systems", () => {
    const result = calculateProjectProposalPricing(buildPricingInput());

    expect(result.systemKw).toBeGreaterThanOrEqual(3);
    expect(result.subsidyEstimate).toBe(SUBSIDY_AMOUNT);
    expect(result.effectiveCustomerInvestment).toBe(result.finalAmount - SUBSIDY_AMOUNT);
  });

  it("11. 610Wp cannot be selected", async () => {
    const prisma610 = createMockPrisma({
      pkg: { id: "pkg-610", ...package610 },
      brands: [polycabBrand],
    });

    await expect(
      resolveProjectProposalPricing(prisma610, {
        packageId: "pkg-610",
        connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
        inverterBrandCodes: ["POLYCAB"],
        structureType: ProposalStructureType.CUSTOM_FABRICATED,
        buildingType: ProposalBuildingType.BUNGALOW,
      }),
    ).rejects.toThrow("PACKAGE_UNAVAILABLE");
  });

  it("12. Pure Hybrid cannot be selected", async () => {
    const prisma = createMockPrisma({
      pkg: { id: "pkg-570", ...package570x6 },
      brands: [
        {
          code: "PURE_HYBRID",
          name: "Pure Hybrid",
          brandUpgradeAmount: 0,
          isActive: false,
          isComingSoon: true,
        },
      ],
    });

    await expect(
      resolveProjectProposalPricing(prisma, {
        packageId: "pkg-570",
        connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
        inverterBrandCodes: ["PURE_HYBRID"],
        structureType: ProposalStructureType.CUSTOM_FABRICATED,
        buildingType: ProposalBuildingType.BUNGALOW,
      }),
    ).rejects.toThrow("INVERTER_BRAND_UNAVAILABLE");
  });

  it("13. Sales Executive sees only own proposals", () => {
    expect(
      canAccessProjectProposal(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-1",
      ),
    ).toBe(true);
    expect(
      canAccessProjectProposal(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe(false);
    expect(
      restrictProjectProposalSalesUserId(
        [ROLES.PROJECTS_SALES_EXECUTIVE],
        "exec-1",
        "exec-2",
      ),
    ).toBe("exec-1");
  });

  it("14. Manager sees all proposals", () => {
    expect(
      canAccessProjectProposal([ROLES.PROJECTS_MANAGER], "manager-1", "exec-2"),
    ).toBe(true);
    expect(
      restrictProjectProposalSalesUserId(
        [ROLES.PROJECTS_MANAGER],
        "manager-1",
        "exec-2",
      ),
    ).toBe("exec-2");
    expect(
      restrictProjectProposalSalesUserId(
        [ROLES.PROJECTS_MANAGER],
        "manager-1",
        undefined,
      ),
    ).toBeUndefined();
  });

  it("15. Revision increments correctly", () => {
    expect(getNextProjectProposalRevisionNo(0)).toBe(1);
    expect(getNextProjectProposalRevisionNo(1)).toBe(2);
    expect(formatRevisionProposalLabel(0)).toBe("R0");
    expect(formatRevisionProposalLabel(getNextProjectProposalRevisionNo(1))).toBe("R2");
  });
});

describe("Projects Proposal validation schemas", () => {
  it("accepts a valid create payload", () => {
    const result = createProjectProposalSchema.safeParse(validProposalPayload);
    expect(result.success).toBe(true);
  });

  it("requires at least one inverter brand", () => {
    const result = projectProposalPricingSchema.safeParse({
      ...validProposalPayload,
      inverterBrandCodes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid customer mobile numbers", () => {
    const result = createProjectProposalSchema.safeParse({
      ...validProposalPayload,
      customerMobile: "123",
    });
    expect(result.success).toBe(false);
  });

  it("requires additional structure provision to cover additional DCR and NDCR panels", () => {
    const invalid = projectProposalPricingSchema.safeParse({
      ...validProposalPayload,
      dcrAdditionalPanels: 2,
      ndcrAdditionalPanels: 1,
      futureStructurePanels: 2,
    });
    const valid = projectProposalPricingSchema.safeParse({
      ...validProposalPayload,
      dcrAdditionalPanels: 2,
      ndcrAdditionalPanels: 1,
      futureStructurePanels: 3,
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });

  it("requires rejection reason with minimum length", () => {
    const invalid = rejectProjectProposalSchema.safeParse({ reason: "no" });
    const valid = rejectProjectProposalSchema.safeParse({
      reason: "Discount exceeds approved limit",
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});
