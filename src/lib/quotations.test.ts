import { describe, expect, it } from "vitest";
import { PricingType } from "@prisma/client";
import {
  QUOTATION_VALIDITY_DAYS,
  addDays,
  calculateLineAmounts,
  formatRevisionQuotationNo,
  isProductPriceEffectiveOn,
  roundMoney,
  toDateOnly,
} from "@/lib/quotations";
import { getFinancialYear } from "@/lib/inventory";

describe("quotation calculations", () => {
  it("calculates WP pricing as qty * capacity * rate plus GST", () => {
    const result = calculateLineAmounts({
      pricingType: PricingType.WP,
      capacity: 590,
      qty: 100,
      rate: 22,
      gstRate: 12,
    });

    expect(result.subtotal).toBe(1298000);
    expect(result.lineTotal).toBe(roundMoney(1298000 * 1.12));
  });

  it("calculates unit pricing as qty * rate plus GST", () => {
    const result = calculateLineAmounts({
      pricingType: PricingType.UNIT,
      capacity: 10,
      qty: 2,
      rate: 52000,
      gstRate: 12,
    });

    expect(result.subtotal).toBe(104000);
    expect(result.lineTotal).toBe(roundMoney(104000 * 1.12));
  });

  it("uses a fixed 3-day validity window", () => {
    const start = new Date("2026-06-16T10:00:00");
    const expiry = addDays(start, QUOTATION_VALIDITY_DAYS);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-06-19");
  });

  it("formats revision numbers on quotation numbers", () => {
    expect(formatRevisionQuotationNo("ISE-QT-26-27-00001", 1)).toBe("ISE-QT-26-27-00001");
    expect(formatRevisionQuotationNo("ISE-QT-26-27-00001", 2)).toBe("ISE-QT-26-27-00001-R2");
  });

  it("uses April-March financial year helper", () => {
    expect(getFinancialYear(new Date("2026-06-16"))).toBe("26-27");
  });

  it("treats same-day price effective times as valid for date-only quotation dates", () => {
    const quotationDate = toDateOnly(new Date("2026-06-16T15:30:00"));
    const priceEffectiveFrom = new Date("2026-06-16T09:00:00");

    expect(isProductPriceEffectiveOn({ effectiveFrom: priceEffectiveFrom, effectiveTo: null }, quotationDate)).toBe(
      true,
    );
    expect(priceEffectiveFrom <= quotationDate).toBe(false);
  });
});
