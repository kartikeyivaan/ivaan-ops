import { describe, expect, it } from "vitest";
import { generateOfficialLetterPdf } from "@/lib/letter-pdf";

const letter = {
  letterDate: new Date("2026-04-10T00:00:00.000Z"),
  content: "<p>This is an official test letter to ISE.</p>",
  signatoryName: "Harshal Patil",
  signatoryDesignation: "Partner",
  signatureImageData: null,
  stampImageData: null,
  stampEnabled: true,
  printSignatureEnabled: true,
  printContentTopOffsetMm: 65,
  company: {
    name: "Ivaan Solar Energy",
    code: "ISE",
    address: "Waaree Solar Center",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 8888 555 832",
    email: "connect@ivaansolar.com",
    gstNumber: "27AAJFI3520N1Z5",
    tagline: "Authorised Waaree Franchise",
  },
};

function pdfText(pdf: Buffer): string {
  return pdf.toString("latin1");
}

describe("official letter PDFs", () => {
  it("omits the internal serial number from official and print output", async () => {
    const official = await generateOfficialLetterPdf(letter, "official");
    const print = await generateOfficialLetterPdf(letter, "print");
    const officialText = pdfText(official);
    const printText = pdfText(print);

    expect(officialText).not.toContain("ISE-LET-");
    expect(printText).not.toContain("ISE-LET-");
    expect(officialText).not.toContain("Letter Serial");
    expect(printText).not.toContain("Letter Serial");
  });

  it("keeps company letterhead artwork on the official PDF and omits it for print", async () => {
    const official = await generateOfficialLetterPdf(letter, "official");
    const print = await generateOfficialLetterPdf(letter, "print");

    expect(official.subarray(0, 5).toString()).toBe("%PDF-");
    expect(print.subarray(0, 5).toString()).toBe("%PDF-");
    expect(official.toString("latin1")).toContain("/XObject");
    expect(print.toString("latin1")).not.toContain("/XObject");
    expect(official.length).toBeGreaterThan(print.length);
  });
});
