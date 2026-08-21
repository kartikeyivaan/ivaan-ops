import { describe, expect, it, vi } from "vitest";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { resolveBankAccount } from "@/lib/bank-statement-import-service";
import type { ParsedBankStatement } from "@/lib/bank-statement-types";
import { ROLES } from "@/lib/rbac";

function parsedWithAccount(accountNumber: string | null): ParsedBankStatement {
  return {
    parserType: "SBI",
    account: {
      accountNumber,
      accountName: "PCM Ventures",
      ifscCode: "SBIN0018300",
    },
    statementStartDate: null,
    statementEndDate: null,
    warnings: [],
    transactions: [],
  };
}

describe("resolveBankAccount — global content mapping", () => {
  it("matches active account by digits-normalized account number across firms", async () => {
    const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      expect(where).toMatchObject({ isActive: true, accountNumber: "44431999106" });
      expect(where).not.toHaveProperty("companyId");
      return {
        id: "ba-pcm-sbi",
        companyId: "co-pcm",
        bankName: "State Bank of India",
        accountName: "PCM Ventures",
        accountNumber: "44431999106",
        accountNumberMasked: "*******9106",
        receivedInAccount: "SBI",
        company: { id: "co-pcm", code: "PCMV", name: "PCM Ventures" },
      };
    });

    const db = { bankAccount: { findFirst } };
    const account = await resolveBankAccount(db as never, parsedWithAccount("44431999106"), {});

    expect(account?.id).toBe("ba-pcm-sbi");
    expect(account?.company.code).toBe("PCMV");
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("returns null when statement has no account number", async () => {
    const findFirst = vi.fn();
    const db = { bankAccount: { findFirst } };
    const account = await resolveBankAccount(db as never, parsedWithAccount(null), {});
    expect(account).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("scopes explicit override to companyId when provided", async () => {
    const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      expect(where).toMatchObject({
        id: "ba-ise-hdfc",
        companyId: "co-ise",
        isActive: true,
      });
      return {
        id: "ba-ise-hdfc",
        companyId: "co-ise",
        bankName: "HDFC Bank",
        accountName: "Ivaan Solar Energy",
        accountNumber: "50200073759818",
        accountNumberMasked: "**********9818",
        receivedInAccount: "HDFC",
        company: { id: "co-ise", code: "ISE", name: "Ivaan Solar Energy" },
      };
    });

    const db = { bankAccount: { findFirst } };
    const account = await resolveBankAccount(db as never, parsedWithAccount("50200073759818"), {
      companyId: "co-ise",
      explicitBankAccountId: "ba-ise-hdfc",
    });

    expect(account?.id).toBe("ba-ise-hdfc");
  });
});

describe("cross-firm confirm access", () => {
  it("allows confirm when user has access to import firm even if active company differs", () => {
    // Active company may be ISE while import mapped to PCMV — access is by membership, not active.
    expect(assertCompanyAccess([ROLES.ACCOUNTS], ["co-ise", "co-pcm"], "co-pcm")).toBe(true);
    expect(assertCompanyAccess([ROLES.ACCOUNTS], ["co-ise"], "co-pcm")).toBe(false);
    expect(assertCompanyAccess([ROLES.SUPER_ADMIN], [], "co-pcm")).toBe(true);
  });
});
