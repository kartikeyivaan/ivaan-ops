import { describe, expect, it } from "vitest";
import {
  buildProjectProposalWhatsappMessage,
  formatWhatsappIndianMoney,
  normalizeMobileForWhatsapp,
  PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER,
} from "@/lib/whatsapp";
import { buildProjectProposalSharePayload } from "@/lib/project-proposal-share";

describe("project proposal whatsapp share", () => {
  it("formats the customer-facing proposal message", () => {
    const message = buildProjectProposalWhatsappMessage({
      customerName: "Rahul Sharma",
      proposalNo: "IVAAN-PP-2526-00012",
      finalAmount: 285000,
      subsidyAmount: 78000,
      effectivePrice: 207000,
      pdfUrl: "https://app.ivaansolar.com/api/share/project-proposal?token=abc",
    });

    expect(message).toContain("Dear Rahul Sharma,");
    expect(message).toContain("Thank you for choosing Ivaan Solar Energy.");
    expect(message).toContain("Proposal No: IVAAN-PP-2526-00012");
    expect(message).toContain("Amount: ₹2,85,000");
    expect(message).toContain("Estimated Subsidy: ₹78,000");
    expect(message).toContain("Effective Customer Investment: ₹2,07,000");
    expect(message).toContain("Validity: 5 Days");
    expect(message).toContain(
      "Proposal PDF: https://app.ivaansolar.com/api/share/project-proposal?token=abc",
    );
    expect(message).toContain("Regards,\nIvaan Solar Energy");
  });

  it("uses a pdf placeholder when no link is available", () => {
    const message = buildProjectProposalWhatsappMessage({
      customerName: "Rahul Sharma",
      proposalNo: "IVAAN-PP-2526-00012",
      finalAmount: 285000,
      subsidyAmount: 78000,
      effectivePrice: 207000,
      pdfUrl: null,
    });

    expect(message).toContain(`Proposal PDF: ${PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER}`);
  });

  it("builds a wa.me url with pricing from the active revision", () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://app.ivaansolar.com";
    process.env.AUTH_SECRET = "test-secret-for-share-token-signing";

    try {
      const payload = buildProjectProposalSharePayload({
        id: "11111111-1111-1111-1111-111111111111",
        proposalNo: "IVAAN-PP-2526-00012",
        currentRevisionNo: 1,
        revisions: [
          {
            revisionNo: 0,
            customerName: "Old Customer",
            customerMobile: "9999999999",
            finalAmount: 250000,
            subsidyEstimate: 78000,
            effectiveCustomerInvestment: 172000,
          },
          {
            revisionNo: 1,
            customerName: "Rahul Sharma",
            customerMobile: "9876543210",
            finalAmount: 285000,
            subsidyEstimate: 78000,
            effectiveCustomerInvestment: 207000,
          },
        ],
      });

      expect(payload.message).toContain("Dear Rahul Sharma,");
      expect(payload.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(payload.pdfUrl).toContain("/api/share/project-proposal?token=");
    } finally {
      process.env.APP_URL = originalAppUrl;
    }
  });

  it("normalizes indian mobile numbers for wa.me links", () => {
    expect(normalizeMobileForWhatsapp("9876543210")).toBe("919876543210");
    expect(formatWhatsappIndianMoney(1234567)).toBe("12,34,567");
  });
});
