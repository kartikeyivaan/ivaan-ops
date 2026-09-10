import { describe, expect, it } from "vitest";
import {
  formatLetterSerialNumber,
  getLetterFinancialYear,
} from "@/lib/letter-number";
import {
  defaultSignatoryForCode,
  isOperationalLetterCompany,
  letterHtmlHasText,
  letterHtmlToBlocks,
  sanitizeLetterHtml,
} from "@/lib/letter-content";
import { formatLetterDate } from "@/lib/utils";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { companyStamp } from "@/lib/pdf-theme";
import { ROLES } from "@/lib/rbac";

describe("official letter helpers", () => {
  it("formats serial numbers like other ops documents", () => {
    expect(formatLetterSerialNumber("ISE", "26-27", 1)).toBe("ISE-LET-26-27-00001");
    expect(formatLetterSerialNumber("PCMV", "26-27", 12)).toBe("PCMV-LET-26-27-00012");
  });

  it("uses April-March financial year from date-only UTC values", () => {
    expect(getLetterFinancialYear(new Date("2026-04-10T00:00:00.000Z"))).toBe("26-27");
    expect(getLetterFinancialYear(new Date("2026-03-31T00:00:00.000Z"))).toBe("25-26");
  });

  it("formats letter dates as D Month YYYY", () => {
    expect(formatLetterDate("2026-04-10")).toBe("10 April 2026");
    expect(formatLetterDate(new Date("2026-04-10T00:00:00.000Z"))).toBe("10 April 2026");
  });

  it("loads default signatories by company code", () => {
    expect(defaultSignatoryForCode("ISE")).toEqual({
      name: "Harshal Patil",
      designation: "Partner",
      printOffsetMm: 65,
    });
    expect(defaultSignatoryForCode("PCMV")).toEqual({
      name: "Kartikey Mahajan",
      designation: "Partner",
      printOffsetMm: 60,
    });
  });

  it("rejects LEARN and inactive companies", () => {
    expect(isOperationalLetterCompany({ code: "LEARN", isPractice: true, isActive: true })).toBe(false);
    expect(isOperationalLetterCompany({ code: "ISE", isPractice: false, isActive: true })).toBe(true);
    expect(isOperationalLetterCompany({ code: "PCMV", isPractice: false, isActive: false })).toBe(false);
  });

  it("restricts access to Super Admin", () => {
    expect(canManageOfficialLetters([ROLES.SUPER_ADMIN])).toBe(true);
    expect(canManageOfficialLetters([ROLES.ACCOUNTS])).toBe(false);
    expect(canManageOfficialLetters([ROLES.SALES_MANAGER])).toBe(false);
  });

  it("sanitizes letter HTML and keeps formatting", () => {
    const html = sanitizeLetterHtml(
      `<p style="text-align:center" onclick="alert(1)">Hello <strong>world</strong><script>bad()</script></p><ul><li>One</li></ul>`,
    );
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("text-align:center");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
  });

  it("converts HTML into PDF blocks", () => {
    const blocks = letterHtmlToBlocks("<p>Hello <strong>ISE</strong></p><ul><li>Item</li></ul>");
    expect(blocks[0]).toMatchObject({ type: "p" });
    expect(letterHtmlHasText("<p><br></p>")).toBe(false);
    expect(letterHtmlHasText("<p>Letter body</p>")).toBe(true);
  });

  it("loads bundled ISE and PCMV stamps", () => {
    expect(companyStamp("ISE")?.byteLength).toBeGreaterThan(1000);
    expect(companyStamp("PCMV")?.byteLength).toBeGreaterThan(1000);
  });
});
