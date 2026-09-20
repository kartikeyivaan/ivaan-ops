import { describe, expect, it } from "vitest";
import {
  courierStickerContentVersion,
  courierStickerPdfVariant,
} from "@/lib/courier-sticker-cache";
import {
  formatCourierFromAddressLines,
  generateCourierStickerPdf,
  resolveCourierRecipient,
} from "@/lib/courier-sticker-pdf";

describe("resolveCourierRecipient", () => {
  it("puts firm first and contact below when both differ", () => {
    expect(
      resolveCourierRecipient({
        customerName: "Patil Enterprises",
        contactPersonName: "Rahul Patil",
      }),
    ).toEqual({ firmName: "Patil Enterprises", contactName: "Rahul Patil" });
  });

  it("hides contact when missing or identical to firm", () => {
    expect(
      resolveCourierRecipient({
        customerName: "Patil Enterprises",
        contactPersonName: null,
      }),
    ).toEqual({ firmName: "Patil Enterprises", contactName: null });

    expect(
      resolveCourierRecipient({
        customerName: "Rahul Patil",
        contactPersonName: "Rahul Patil",
      }),
    ).toEqual({ firmName: "Rahul Patil", contactName: null });
  });
});

describe("formatCourierFromAddressLines", () => {
  it("splits street address on commas and keeps locality intact", () => {
    expect(
      formatCourierFromAddressLines([
        "Opp. K. U. Kolhe School, Old Nashirabad Road",
        "Jalgaon, Maharashtra 425001, IN",
      ]),
    ).toEqual([
      "Opp. K. U. Kolhe School,",
      "Old Nashirabad Road,",
      "Jalgaon, Maharashtra 425001, IN",
    ]);
  });
});
const stickerCustomer = {
  customerName: "Patil Enterprises",
  contactPersonName: "Rahul Patil",
  address: "12, Shivaji Nagar\nNear Bus Stand",
  city: "Jalgaon",
  state: "Maharashtra",
  pinCode: "425001",
  mobile: "9876543210",
};

describe("courier sticker stored PDF keys", () => {
  it("returns the same variant and contentVersion for identical sticker inputs", () => {
    const input = {
      updatedAt: "2026-09-20T10:00:00.000Z",
      dcNo: "ISE-DC-26-27-00062",
      invoiceNumber: "INV-1",
      boxCount: 3,
      customer: stickerCustomer,
    };

    expect(courierStickerPdfVariant(input.boxCount, input.customer, input.invoiceNumber)).toBe(
      courierStickerPdfVariant(3, { ...stickerCustomer }, "INV-1"),
    );
    expect(courierStickerContentVersion(input)).toBe(
      courierStickerContentVersion({ ...input, customer: { ...stickerCustomer } }),
    );
    expect(courierStickerPdfVariant(3, stickerCustomer, "INV-1")).toMatch(
      /^courier-sticker:3:[0-9a-f]{16}$/,
    );
  });

  it("changes variant when box count or printed address changes", () => {
    const variant = courierStickerPdfVariant(3, stickerCustomer, "INV-1");
    expect(courierStickerPdfVariant(4, stickerCustomer, "INV-1")).not.toBe(variant);
    expect(
      courierStickerPdfVariant(3, { ...stickerCustomer, address: "Other street" }, "INV-1"),
    ).not.toBe(variant);
    expect(courierStickerContentVersion({
      updatedAt: "2026-09-20T10:00:00.000Z",
      dcNo: "ISE-DC-26-27-00062",
      invoiceNumber: "INV-1",
      boxCount: 3,
      customer: stickerCustomer,
    })).not.toBe(
      courierStickerContentVersion({
        updatedAt: "2026-09-20T10:00:00.000Z",
        dcNo: "ISE-DC-26-27-00062",
        invoiceNumber: "INV-1",
        boxCount: 4,
        customer: stickerCustomer,
      }),
    );
  });
});

describe("generateCourierStickerPdf", () => {
  it("builds a multi-page A4 PDF for 10 boxes (8 + 2)", async () => {
    const pdf = await generateCourierStickerPdf({
      dcNo: "ISE-DC-26-27-00062",
      invoiceNumber: null,
      boxCount: 10,
      customer: {
        customerName: "Patil Enterprises",
        contactPersonName: "Rahul Patil",
        address: "12, Shivaji Nagar\nNear Bus Stand",
        city: "Jalgaon",
        state: "Maharashtra",
        mobile: "9876543210",
      },
      company: {
        name: "Ivaan Solar Energy",
        code: "ISE",
        address: "Opp. K. U. Kolhe School, Old Nashirabad Road",
        city: "Jalgaon",
        state: "Maharashtra",
        pincode: "425001",
        phone: "+91 8888 555 832",
      },
    });

    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("rejects invalid box counts", async () => {
    await expect(
      generateCourierStickerPdf({
        dcNo: "ISE-DC-26-27-00062",
        boxCount: 0,
        customer: { customerName: "Test" },
        company: { name: "Ivaan Solar Energy", code: "ISE" },
      }),
    ).rejects.toThrow(/Box count/);
  });
});
