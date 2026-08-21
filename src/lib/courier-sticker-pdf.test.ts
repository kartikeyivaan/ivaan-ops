import { describe, expect, it } from "vitest";
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
