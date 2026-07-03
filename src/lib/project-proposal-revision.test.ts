import { describe, expect, it } from "vitest";
import { ProjectProposalStatus } from "@prisma/client";
import {
  canReviseProjectProposal,
  getNextProjectProposalRevisionNo,
  mapRevisionBrandNamesToCodes,
} from "@/lib/project-proposal-revision";

describe("project proposal revision", () => {
  it("allows revising sent, approved, rejected, and expired proposals", () => {
    expect(canReviseProjectProposal(ProjectProposalStatus.SENT)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.APPROVED)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.REJECTED)).toBe(true);
    expect(canReviseProjectProposal(ProjectProposalStatus.EXPIRED)).toBe(true);
  });

  it("blocks revising draft, pending approval, and converted proposals", () => {
    expect(canReviseProjectProposal(ProjectProposalStatus.DRAFT)).toBe(false);
    expect(canReviseProjectProposal(ProjectProposalStatus.PENDING_APPROVAL)).toBe(false);
    expect(canReviseProjectProposal(ProjectProposalStatus.CONVERTED)).toBe(false);
  });

  it("maps stored inverter brand names back to master codes", () => {
    const codes = mapRevisionBrandNamesToCodes(["Polycab", "Deye"], [
      { code: "POLYCAB", name: "Polycab" },
      { code: "DEYE", name: "Deye" },
      { code: "WAAREE", name: "Waaree" },
    ]);

    expect(codes).toEqual(["POLYCAB", "DEYE"]);
  });

  it("increments revision numbers for successive revisions", () => {
    expect(getNextProjectProposalRevisionNo(0)).toBe(1);
    expect(getNextProjectProposalRevisionNo(1)).toBe(2);
  });
});
