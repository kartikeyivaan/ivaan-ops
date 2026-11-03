import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { quotationPdfContentVersion } from "@/lib/pdf-content-versions";
import type { QuotationRecord } from "@/lib/quotation-service";

function minimalQuotation(overrides: Partial<QuotationRecord> = {}): QuotationRecord {
  const base = {
    id: "q1",
    quotationNo: "Q-2025-001",
    companyId: "c1",
    customerId: "cust1",
    salesUserId: "u1",
    status: "SENT",
    revisionNo: 1,
    parentQuotationId: null,
    quotationDate: new Date("2025-01-01"),
    expiryDate: new Date("2025-01-04"),
    totalValue: new Prisma.Decimal(1000),
    notes: null,
    deliveryTermMode: "LEGACY",
    bookingAllowed: false,
    requiredPaymentPercent: null,
    dispatchMinDays: null,
    dispatchMaxDays: null,
    deliveryTermNoteSnapshot: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01T10:00:00.000Z"),
    company: {
      id: "c1",
      name: "ISE",
      code: "ISE",
      isDemo: false,
      logoUrl: null,
      digitalSignatureUrl: null,
      address: null,
      city: null,
      state: null,
      pincode: null,
      phone: null,
      email: null,
      gstNumber: null,
      tagline: null,
      bankDetails: null,
      termsAndConditions: null,
    },
    customer: {
      id: "cust1",
      customerName: "Acme",
      customerCode: "ACME",
      gstNumber: "",
      address: null,
      city: null,
      state: null,
      mobile: null,
      email: null,
    },
    salesUser: {
      id: "u1",
      name: "Exec",
      email: "e@example.com",
      mobile: null,
      officialContactNumber: null,
    },
    parentQuotation: null,
    revisions: [],
    items: [
      {
        id: "i1",
        quotationId: "q1",
        productId: "p1",
        qty: new Prisma.Decimal(2),
        rate: new Prisma.Decimal(500),
        gstRate: new Prisma.Decimal(18),
        lineTotal: new Prisma.Decimal(1000),
        approvalStatus: "APPROVED",
        product: {
          id: "p1",
          displayName: "Panel",
          pricingType: "UNIT",
          capacity: new Prisma.Decimal(550),
          capacityUnit: "WP",
          gstRate: new Prisma.Decimal(18),
          hsn: "8541",
        },
      },
    ],
  } satisfies QuotationRecord;
  return { ...base, ...overrides };
}

describe("quotationPdfContentVersion", () => {
  it("changes when line items change", () => {
    const before = quotationPdfContentVersion(minimalQuotation());
    const after = quotationPdfContentVersion(
      minimalQuotation({
        items: [
          {
            ...minimalQuotation().items[0],
            qty: new Prisma.Decimal(3),
            lineTotal: new Prisma.Decimal(1500),
          },
        ],
        totalValue: new Prisma.Decimal(1500),
      }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when revision number changes", () => {
    const r1 = quotationPdfContentVersion(minimalQuotation({ revisionNo: 1 }));
    const r2 = quotationPdfContentVersion(
      minimalQuotation({
        revisionNo: 2,
        quotationNo: "Q-2025-001-R2",
        id: "q2",
      }),
    );
    expect(r2).not.toBe(r1);
  });
});
