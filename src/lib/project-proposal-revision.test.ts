import { describe, expect, it } from "vitest";
import { ProjectProposalStatus } from "@prisma/client";
import {
  canReviseProjectProposal,
  getNextProjectProposalRevisionNo,
  isPostConversionProposal,
  mapRevisionBrandNamesToCodes,
  mapRevisionToFormValues,
  requiresManagerApprovalForProposal,
} from "@/lib/project-proposal-revision";

describe("project proposal revision", () => {
  it("allows revising sent, approved, rejected, expired, and converted proposals", () => {
    expect(canReviseProjectProposal(ProjectProposalStatus.SENT)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.APPROVED)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.REJECTED)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.EXPIRED)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.CONVERTED)).toBe(true);
  });

  it("blocks revising draft and pending approval proposals", () => {
    expect(canReviseProjectProposal(ProjectProposalStatus.DRAFT)).toBe(false);
    expect(canReviseProjectProposal(ProjectProposalStatus.PENDING_APPROVAL)).toBe(false);
  });

  it("maps stored inverter brand names back to master codes", () => {
    const codes = mapRevisionBrandNamesToCodes(["Polycab", "Deye"], [
      { code: "POLYCAB", name: "Polycab" },
      { code: "DEYE", name: "Deye" },
      { code: "WAAREE", name: "Waaree" },
    ]);

    expect(codes).toEqual(["POLYCAB", "DEYE"]);
  });

  it("maps inverter brand codes when names are already stored as codes", () => {
    const codes = mapRevisionBrandNamesToCodes(["POLYCAB", "deye"], [
      { code: "POLYCAB", name: "Polycab" },
      { code: "DEYE", name: "Deye" },
    ]);

    expect(codes).toEqual(["POLYCAB", "DEYE"]);
  });

  it("copies previously selected proposal options into revise form values", () => {
    const values = mapRevisionToFormValues(
      {
        customerName: "Asha",
        customerMobile: "9876543210",
        shortAddress: "Pune",
        proposalDate: "2026-08-01",
        validityDate: "2026-08-16",
        package: { id: "pkg-2" },
        connectionPhase: "THREE_PHASE",
        inverterBrands: ["Deye"],
        inverterUpgrade: { id: "upgrade-5kw" },
        structureType: "MONO_RAIL",
        buildingType: "APARTMENT",
        extraFloors: 2,
        futureStructurePanels: 4,
        dcrAdditionalPanels: 2,
        ndcrAdditionalPanels: 1,
        ndcrPanelWp: 585,
        discountAmount: 1500,
        additionalCostAmount: 250,
        notes: "Keep options",
      },
      [{ code: "DEYE", name: "Deye" }],
    );

    expect(values.packageId).toBe("pkg-2");
    expect(values.connectionPhase).toBe("THREE_PHASE");
    expect(values.inverterBrandCodes).toEqual(["DEYE"]);
    expect(values.inverterUpgradeId).toBe("upgrade-5kw");
    expect(values.structureType).toBe("MONO_RAIL");
    expect(values.buildingType).toBe("APARTMENT");
    expect(values.extraFloors).toBe("2");
    expect(values.futureStructurePanels).toBe("4");
    expect(values.dcrAdditionalPanels).toBe("2");
    expect(values.ndcrAdditionalPanels).toBe("1");
  });

  it("requires manager approval for any post-conversion change", () => {
    expect(isPostConversionProposal("2026-08-14T00:00:00.000Z")).toBe(true);
    expect(isPostConversionProposal(null)).toBe(false);
    expect(
      requiresManagerApprovalForProposal({
        convertedAt: "2026-08-14T00:00:00.000Z",
        discountAmount: 0,
        approvalThreshold: 5000,
      }),
    ).toBe(true);
    expect(
      requiresManagerApprovalForProposal({
        convertedAt: null,
        discountAmount: 1000,
        approvalThreshold: 5000,
      }),
    ).toBe(false);
  });

  it("increments revision numbers for successive revisions", () => {
    expect(getNextProjectProposalRevisionNo(0)).toBe(1);
    expect(getNextProjectProposalRevisionNo(1)).toBe(2);
  });
});
