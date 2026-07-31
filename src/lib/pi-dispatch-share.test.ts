import { describe, expect, it } from "vitest";
import { buildDispatchWhatsappUrl } from "@/lib/dispatch-share";
import { buildProformaInvoiceWhatsappUrl } from "@/lib/pi-share";
import {
  buildDispatchWhatsappMessage,
  buildProformaInvoiceWhatsappMessage,
} from "@/lib/whatsapp";

describe("proforma invoice and delivery challan whatsapp share", () => {
  it("formats the customer-facing PI message", () => {
    const message = buildProformaInvoiceWhatsappMessage({
      customerName: "Rahul Sharma",
      companyName: "Ivaan Solar Energy",
      piNo: "IVAAN-PI-2526-00012",
      pdfUrl: "https://app.ivaansolar.com/api/share/proforma-invoice?token=abc",
      salespersonName: "Asha",
    });

    expect(message).toContain("Hi Rahul Sharma");
    expect(message).toContain("proforma invoice IVAAN-PI-2526-00012");
    expect(message).toContain(
      "https://app.ivaansolar.com/api/share/proforma-invoice?token=abc",
    );
    expect(message).toContain("— Asha");
  });

  it("formats the customer-facing delivery challan message", () => {
    const message = buildDispatchWhatsappMessage({
      customerName: "Rahul Sharma",
      companyName: "Ivaan Solar Energy",
      dcNo: "IVAAN-DC-2526-00005",
      piNo: "IVAAN-PI-2526-00012",
      pdfUrl: "https://app.ivaansolar.com/api/share/dispatch?token=abc",
    });

    expect(message).toContain("Hi Rahul Sharma");
    expect(message).toContain("Delivery Challan IVAAN-DC-2526-00005");
    expect(message).toContain("PI IVAAN-PI-2526-00012");
    expect(message).toContain("https://app.ivaansolar.com/api/share/dispatch?token=abc");
  });

  it("builds PI wa.me url once issued", () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://app.ivaansolar.com";
    process.env.AUTH_SECRET = "test-secret-for-share-token-signing";

    try {
      const url = buildProformaInvoiceWhatsappUrl({
        id: "11111111-1111-1111-1111-111111111111",
        piNo: "IVAAN-PI-2526-00012",
        status: "ISSUED",
        customer: { customerName: "Rahul Sharma", mobile: "9876543210" },
        company: { name: "Ivaan Solar Energy" },
        salesUser: { name: "Asha" },
      });

      expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(decodeURIComponent(url!)).toContain("/api/share/proforma-invoice?token=");
    } finally {
      process.env.APP_URL = originalAppUrl;
    }
  });

  it("does not share draft PI or undispatched challan", () => {
    process.env.AUTH_SECRET = "test-secret-for-share-token-signing";
    process.env.APP_URL = "https://app.ivaansolar.com";

    expect(
      buildProformaInvoiceWhatsappUrl({
        id: "11111111-1111-1111-1111-111111111111",
        piNo: "IVAAN-PI-2526-00012",
        status: "DRAFT",
        customer: { customerName: "Rahul Sharma", mobile: "9876543210" },
        company: { name: "Ivaan Solar Energy" },
        salesUser: { name: "Asha" },
      }),
    ).toBeNull();

    expect(
      buildDispatchWhatsappUrl({
        id: "22222222-2222-2222-2222-222222222222",
        dcNo: "IVAAN-DC-2526-00005",
        status: "DRAFT",
        customer: { customerName: "Rahul Sharma", mobile: "9876543210" },
        company: { name: "Ivaan Solar Energy" },
        proformaInvoice: { piNo: "IVAAN-PI-2526-00012" },
      }),
    ).toBeNull();
  });

  it("builds delivery challan wa.me url after DISPATCHED", () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://app.ivaansolar.com";
    process.env.AUTH_SECRET = "test-secret-for-share-token-signing";

    try {
      const url = buildDispatchWhatsappUrl({
        id: "22222222-2222-2222-2222-222222222222",
        dcNo: "IVAAN-DC-2526-00005",
        status: "DISPATCHED",
        customer: { customerName: "Rahul Sharma", mobile: "9876543210" },
        company: { name: "Ivaan Solar Energy" },
        proformaInvoice: { piNo: "IVAAN-PI-2526-00012" },
      });

      expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(decodeURIComponent(url!)).toContain("/api/share/dispatch?token=");
    } finally {
      process.env.APP_URL = originalAppUrl;
    }
  });
});
