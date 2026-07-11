import { describe, expect, it } from "vitest";
import {
  ProposalBuildingType,
  ProposalConnectionPhase,
  ProposalStructureType,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { generateProjectProposalPdf, generateProjectProposalQuoteCardPdf, type ProjectProposalPdfRecord } from "@/lib/project-proposal-pdf";
import { ISE_BANK_DETAILS } from "@/lib/proposal-pdf-content";

function countPdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function buildProposalFixture(): ProjectProposalPdfRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    proposalNo: "ISE-PP-2526-00001",
    companyId: "22222222-2222-2222-2222-222222222222",
    salesUserId: "33333333-3333-3333-3333-333333333333",
    status: "APPROVED",
    currentRevisionNo: 0,
    convertedAt: null,
    convertedById: null,
    createdById: "33333333-3333-3333-3333-333333333333",
    updatedById: "33333333-3333-3333-3333-333333333333",
    createdAt: new Date("2026-04-01"),
    updatedAt: new Date("2026-04-01"),
    company: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Ivaan Solar Energy",
      code: "ISE",
      address: "123 Solar Park",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380001",
      phone: "+91 98765 43210",
      email: "info@ivaansolar.com",
      gstNumber: "24AAAAA0000A1Z5",
      tagline: "Powering clean energy",
      bankDetails: null,
      termsAndConditions: null,
    },
    salesUser: {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Projects Sales",
      email: "projects.sales@ivaansolar.com",
      mobile: "9876543210",
    },
    revisions: [
      {
        id: "44444444-4444-4444-4444-444444444444",
        proposalId: "11111111-1111-1111-1111-111111111111",
        revisionNo: 0,
        customerName: "Rahul Sharma",
        customerMobile: "9876543210",
        shortAddress: "Satellite, Ahmedabad",
        proposalDate: new Date("2026-04-01"),
        validityDate: new Date("2026-04-06"),
        packageId: "55555555-5555-5555-5555-555555555555",
        connectionPhase: ProposalConnectionPhase.SINGLE_PHASE,
        inverterBrands: ["Polycab", "Deye"],
        inverterUpgradeId: null,
        structureType: ProposalStructureType.CUSTOM_FABRICATED,
        buildingType: ProposalBuildingType.BUNGALOW,
        extraFloors: 1,
        ndcrAdditionalPanels: 2,
        ndcrPanelWp: 580,
        dcrAdditionalPanels: 0,
        futureStructurePanels: 1,
        basePackageAmount: new Prisma.Decimal(195000),
        brandUpgradeAmount: new Prisma.Decimal(0),
        inverterUpgradeAmount: new Prisma.Decimal(0),
        threePhaseAmount: new Prisma.Decimal(0),
        structureAdjustmentAmount: new Prisma.Decimal(0),
        extraFloorAmount: new Prisma.Decimal(2000),
        futureStructureAmount: new Prisma.Decimal(3000),
        ndcrPanelAmount: new Prisma.Decimal(23000),
        dcrPanelAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(5000),
        additionalCostAmount: new Prisma.Decimal(0),
        subsidyEstimate: new Prisma.Decimal(78000),
        finalAmount: new Prisma.Decimal(218000),
        effectiveCustomerInvestment: new Prisma.Decimal(140000),
        notes: "Customer prefers morning installation.",
        createdById: "33333333-3333-3333-3333-333333333333",
        updatedById: "33333333-3333-3333-3333-333333333333",
        createdAt: new Date("2026-04-01"),
        updatedAt: new Date("2026-04-01"),
        package: {
          id: "55555555-5555-5555-5555-555555555555",
          code: "P2",
          name: "570+Wp × 6 panels",
          description: "570+Wp × 6 Panels, 3.3kW Polycab/Deye",
          panelWp: 570,
          panelCount: 6,
          systemKw: new Prisma.Decimal(3.3),
          defaultInverterBrands: ["Polycab", "Deye"],
          basePrice: new Prisma.Decimal(195000),
          sortOrder: 2,
          isActive: true,
          isComingSoon: false,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
        inverterUpgrade: null,
      },
    ],
  };
}

describe("project proposal pdf", () => {
  it("generates a non-empty full proposal PDF buffer", async () => {
    const pdf = await generateProjectProposalPdf(buildProposalFixture());
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("generates a non-empty quote card PDF buffer", async () => {
    const pdf = await generateProjectProposalQuoteCardPdf(buildProposalFixture());
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("keeps the quote card on a single page with full ISE company details", async () => {
    const proposal = buildProposalFixture();
    proposal.company = {
      ...proposal.company,
      address: "Waaree Solar Center, Opp. K. U. Kolhe School,\nOld Nashirabad Road, Near Kalika Mata Mandir Chowk",
      city: "Jalgaon",
      state: "Maharashtra",
      pincode: "425001",
      phone: "+91 8888 555 832",
      email: "connect@ivaansolar.com",
      gstNumber: "27AAJFI3520N1Z5",
      tagline: "Authorised Waaree Franchise",
      bankDetails: ISE_BANK_DETAILS,
    };

    const pdf = await generateProjectProposalQuoteCardPdf(proposal);
    expect(countPdfPages(pdf)).toBe(1);
  });
});
