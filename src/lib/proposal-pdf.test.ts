import { describe, expect, it } from "vitest";
import { buildProposalBom, calculateProposedSystemKwp, totalProposedPanelCount } from "@/lib/proposal-bom";
import {
  calculateEnvironmentalImpact,
  calculateGenerationEstimate,
  calculateMonthlyGeneration,
  SPECIFIC_GENERATION_KWH_PER_KWP,
} from "@/lib/proposal-generation";
import { formatProposalDocumentNumber, formatRevisionProposalLabel } from "@/lib/project-proposals";

describe("proposal generation", () => {
  it("calculates annual generation at 1700 kWh/kWp", () => {
    const result = calculateGenerationEstimate(3.3);
    expect(result.annualGenerationKwh).toBe(Math.round(3.3 * SPECIFIC_GENERATION_KWH_PER_KWP));
    expect(result.specificGenerationKwhPerKwp).toBe(1700);
  });

  it("derives environmental impact from annual generation", () => {
    const generation = calculateGenerationEstimate(4);
    const impact = calculateEnvironmentalImpact(generation.annualGenerationKwh);
    expect(impact.co2OffsetMetricTons).toBeGreaterThan(0);
    expect(impact.equivalentTreesPlanted).toBeGreaterThan(0);
  });

  it("varies monthly generation by Jalgaon seasonal solar factors", () => {
    const annual = calculateGenerationEstimate(3.3).annualGenerationKwh;
    const rows = calculateMonthlyGeneration(annual);
    const values = rows.map((row) => row.acEnergyKwh);

    expect(rows).toHaveLength(12);
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(rows[3]?.month).toBe("April");
    expect(rows[3]!.acEnergyKwh).toBeGreaterThan(rows[6]!.acEnergyKwh);
    expect(rows.reduce((sum, row) => sum + row.acEnergyKwh, 0)).toBe(annual);
  });
});

describe("proposal bom", () => {
  it("includes separate DCR and NDCR module rows", () => {
    const bom = buildProposalBom({
      panelWp: 570,
      panelCount: 6,
      systemKw: 3.3,
      ndcrAdditionalPanels: 1,
      ndcrPanelWp: 580,
      inverterBrand: "Polycab",
      inverterKw: 3,
      connectionPhase: "SINGLE_PHASE",
      structureType: "CUSTOM_FABRICATED",
    });

    const moduleLines = bom.filter((line) => line.description.includes("Modules"));
    expect(moduleLines).toHaveLength(2);
    expect(moduleLines[0]?.description).toContain("DCR");
    expect(moduleLines[1]?.description).toContain("NDCR Bi-580Wp+");
  });

  it("calculates proposed system kWp from all panel wattages", () => {
    expect(
      calculateProposedSystemKwp({
        panelWp: 570,
        panelCount: 9,
        ndcrPanelWp: 580,
        ndcrAdditionalPanels: 1,
        futureStructurePanels: 0,
      }),
    ).toBe(5.7);
    expect(
      totalProposedPanelCount({
        panelCount: 9,
        ndcrAdditionalPanels: 1,
        futureStructurePanels: 2,
      }),
    ).toBe(12);
  });
});

describe("proposal document numbers", () => {
  it("formats revision labels and document numbers", () => {
    expect(formatRevisionProposalLabel(0)).toBe("R0");
    expect(formatRevisionProposalLabel(2)).toBe("R2");
    expect(formatProposalDocumentNumber("ISE-PP-2526-00001", 0)).toBe("ISE-PP-2526-00001");
    expect(formatProposalDocumentNumber("ISE-PP-2526-00001", 2)).toBe("ISE-PP-2526-00001-R2");
  });
});
