import { describe, expect, it } from "vitest";
import { maskBankAccountNumber } from "@/lib/bank-account-service";

describe("maskBankAccountNumber", () => {
  it("masks all but the last four digits", () => {
    expect(maskBankAccountNumber("44431999106")).toBe("*******9106");
    expect(maskBankAccountNumber("037505012379")).toBe("********2379");
  });

  it("ignores non-digits when masking", () => {
    expect(maskBankAccountNumber("AC 1234 5678")).toBe("****5678");
  });
});

describe("Sales visibility filter", () => {
  it("includes only active accounts marked visibleToSales", () => {
    const accounts = [
      { id: "1", isActive: true, visibleToSales: true },
      { id: "2", isActive: true, visibleToSales: false },
      { id: "3", isActive: false, visibleToSales: true },
    ];
    const visibleIds = accounts
      .filter((a) => a.isActive && a.visibleToSales)
      .map((a) => a.id);
    expect(visibleIds).toEqual(["1"]);
  });
});
