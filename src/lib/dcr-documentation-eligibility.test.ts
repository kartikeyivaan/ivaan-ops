import { DocumentationStatus, PiCreditStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DCR_PORTAL_STRATEGY,
  filterAutomationQueueEligibleLines,
  filterDcrModuleLines,
  isAutomationQueueEligibleLine,
  isDcrModuleProduct,
  isNonDcrCertificateModule,
  isPiEligibleForDcrDocumentation,
  nextPortalAfterFailure,
  portalAttemptOrder,
  resolveDocumentationInitialStatus,
} from "@/lib/dcr-documentation-eligibility";

describe("isDcrModuleProduct", () => {
  it("includes true DCR panel names from masters and proposals", () => {
    expect(isDcrModuleProduct("Waaree 590W DCR")).toBe(true);
    expect(isDcrModuleProduct("Waaree TOPCON DCR Bi-570+Wp Modules")).toBe(true);
    expect(isDcrModuleProduct("Modules - Waaree - TOPCon DCR - 590 Wp")).toBe(true);
  });

  it("excludes N-DCR master naming", () => {
    expect(isDcrModuleProduct("Modules - Waaree - TOPCon N-DCR - 615 Wp")).toBe(false);
    expect(isDcrModuleProduct("Modules - Waaree - TOPCon N-DCR - 580 Wp")).toBe(false);
  });

  it("excludes NDCR modules", () => {
    expect(isDcrModuleProduct("Waaree 580Wp NDCR")).toBe(false);
    expect(isDcrModuleProduct("Waaree 585Wp TOPCon NDCR Bifacial")).toBe(false);
    expect(isDcrModuleProduct("Waaree NDCR Bi-580+Wp Modules")).toBe(false);
  });

  it("treats non-DCR products as ineligible", () => {
    expect(isDcrModuleProduct("Polycab 6 Sqmm DC Cable")).toBe(false);
    expect(isDcrModuleProduct("")).toBe(false);
  });
});

describe("isNonDcrCertificateModule", () => {
  it("flags NDCR and N-DCR only", () => {
    expect(isNonDcrCertificateModule("Waaree 580Wp NDCR")).toBe(true);
    expect(isNonDcrCertificateModule("Modules - Waaree - TOPCon N-DCR - 615 Wp")).toBe(true);
    expect(isNonDcrCertificateModule("Waaree 590W DCR")).toBe(false);
  });
});

describe("isPiEligibleForDcrDocumentation", () => {
  it("allows none, rejected, and cleared credit", () => {
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.NONE)).toBe(true);
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.REJECTED)).toBe(true);
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.CLEARED)).toBe(true);
  });

  it("blocks active or pending credit", () => {
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.APPROVED)).toBe(false);
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.PENDING_SM)).toBe(false);
    expect(isPiEligibleForDcrDocumentation(PiCreditStatus.PENDING_ACCOUNTS)).toBe(false);
  });
});

describe("resolveDocumentationInitialStatus", () => {
  const dcrLine = { productDisplayName: "Waaree 590W DCR" };
  const ndcrLine = { productDisplayName: "Modules - Waaree - TOPCon N-DCR - 615 Wp" };

  it("returns PENDING when DCR lines exist and credit is cleared", () => {
    expect(
      resolveDocumentationInitialStatus({
        creditStatus: PiCreditStatus.CLEARED,
        lines: [dcrLine],
      }),
    ).toBe(DocumentationStatus.PENDING);
  });

  it("returns NOT_REQUIRED when only NDCR lines exist", () => {
    expect(
      resolveDocumentationInitialStatus({
        creditStatus: PiCreditStatus.NONE,
        lines: [ndcrLine],
      }),
    ).toBe(DocumentationStatus.NOT_REQUIRED);
  });

  it("returns NOT_REQUIRED when PI is on approved credit", () => {
    expect(
      resolveDocumentationInitialStatus({
        creditStatus: PiCreditStatus.APPROVED,
        lines: [dcrLine],
      }),
    ).toBe(DocumentationStatus.NOT_REQUIRED);
  });

  it("returns PENDING for mixed dispatch when at least one DCR line exists", () => {
    expect(
      resolveDocumentationInitialStatus({
        creditStatus: PiCreditStatus.NONE,
        lines: [ndcrLine, dcrLine, { productDisplayName: "Inverter 5kW" }],
      }),
    ).toBe(DocumentationStatus.PENDING);
  });
});

describe("filterDcrModuleLines", () => {
  it("keeps only certificate-eligible lines", () => {
    const lines = [
      { id: "1", productDisplayName: "Waaree 590W DCR" },
      { id: "2", productDisplayName: "Modules - Waaree - TOPCon N-DCR - 615 Wp" },
      { id: "3", productDisplayName: "Inverter" },
    ];
    expect(filterDcrModuleLines(lines).map((l) => l.id)).toEqual(["1"]);
  });
});

describe("automation queue line eligibility", () => {
  const base = {
    productDisplayName: "Waaree 590W DCR",
    documentationStatus: DocumentationStatus.PENDING,
    creditStatus: PiCreditStatus.NONE,
    invoiceRecorded: true,
    includeEarlyDcr: false,
  };

  it("requires PENDING documentation", () => {
    expect(
      isAutomationQueueEligibleLine({
        ...base,
        documentationStatus: DocumentationStatus.HOLD,
      }),
    ).toBe(false);
  });

  it("requires invoice by default", () => {
    expect(
      isAutomationQueueEligibleLine({
        ...base,
        invoiceRecorded: false,
        includeEarlyDcr: false,
      }),
    ).toBe(false);
  });

  it("allows pre-invoice when includeEarlyDcr is true", () => {
    expect(
      isAutomationQueueEligibleLine({
        ...base,
        invoiceRecorded: false,
        includeEarlyDcr: true,
      }),
    ).toBe(true);
  });

  it("filters lines in batch", () => {
    const rows = filterAutomationQueueEligibleLines([
      base,
      { ...base, productDisplayName: "N-DCR panel", invoiceRecorded: true },
      { ...base, invoiceRecorded: false, includeEarlyDcr: false },
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("portal strategy helpers", () => {
  it("defaults to PCMV then ISE", () => {
    expect(DEFAULT_DCR_PORTAL_STRATEGY).toBe("PCMV_THEN_ISE");
    expect(portalAttemptOrder("PCMV_THEN_ISE")).toEqual(["PCMV", "ISE"]);
  });

  it("supports swapped and single-portal strategies", () => {
    expect(portalAttemptOrder("ISE_THEN_PCMV")).toEqual(["ISE", "PCMV"]);
    expect(portalAttemptOrder("PCMV_ONLY")).toEqual(["PCMV"]);
    expect(portalAttemptOrder("ISE_ONLY")).toEqual(["ISE"]);
  });

  it("returns next portal after a failed attempt", () => {
    expect(nextPortalAfterFailure("PCMV_THEN_ISE", ["PCMV"])).toBe("ISE");
    expect(nextPortalAfterFailure("PCMV_THEN_ISE", ["PCMV", "ISE"])).toBe(null);
    expect(nextPortalAfterFailure("PCMV_ONLY", ["PCMV"])).toBe(null);
  });
});
