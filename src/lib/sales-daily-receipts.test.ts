import { describe, expect, it } from "vitest";
import {
  generatePaymentCodeCandidate,
  isValidPaymentCodeFormat,
} from "@/lib/bank-payment-code";
import {
  salesAvailabilityLabel,
  salesReceiptBanksForCompany,
} from "@/lib/sales-daily-receipts-service";

describe("bank payment codes", () => {
  it("generates P-prefixed uppercase codes without ambiguous characters", () => {
    for (let i = 0; i < 40; i += 1) {
      const code = generatePaymentCodeCandidate();
      expect(isValidPaymentCodeFormat(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
      expect(code.startsWith("P")).toBe(true);
    }
  });
});

describe("sales daily receipts helpers", () => {
  it("combines ISE banks as SBI + HDFC + ICICI", () => {
    expect(salesReceiptBanksForCompany({ code: "ISE", name: "Ivaan Solar Energy" })).toEqual([
      "SBI",
      "HDFC",
      "ICICI",
    ]);
  });

  it("combines PCM banks as SBI + HDFC", () => {
    expect(salesReceiptBanksForCompany({ code: "PCMV", name: "PCM Ventures" })).toEqual([
      "SBI",
      "HDFC",
    ]);
  });

  it("maps assignment statuses to Sales availability labels", () => {
    expect(salesAvailabilityLabel("UNASSIGNED")).toBe("Available");
    expect(salesAvailabilityLabel("PARTIALLY_ASSIGNED")).toBe("Partially Used");
    expect(salesAvailabilityLabel("FULLY_ASSIGNED")).toBe("Fully Used");
  });
});
