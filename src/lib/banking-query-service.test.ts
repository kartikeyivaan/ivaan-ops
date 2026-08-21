import { describe, expect, it } from "vitest";
import { BankTransactionAssignmentStatus } from "@prisma/client";
import {
  classifyCompanyForBankDashboard,
  summarizeCreditAvailability,
} from "@/lib/banking-query-service";

describe("summarizeCreditAvailability", () => {
  it("buckets remaining credit by assignment status", () => {
    const result = summarizeCreditAvailability([
      {
        creditAmount: 10000,
        assignmentStatus: BankTransactionAssignmentStatus.UNASSIGNED,
        allocations: [],
      },
      {
        creditAmount: 5000,
        assignmentStatus: BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED,
        allocations: [{ allocatedAmount: 2000 }],
      },
      {
        creditAmount: 8000,
        assignmentStatus: BankTransactionAssignmentStatus.FULLY_ASSIGNED,
        allocations: [{ allocatedAmount: 8000 }],
      },
    ]);

    expect(result.unassignedCreditAmount).toBe(10000);
    expect(result.partiallyAssignedCreditAmount).toBe(3000);
  });

  it("ignores over-allocated leftovers as zero available", () => {
    const result = summarizeCreditAvailability([
      {
        creditAmount: 1000,
        assignmentStatus: BankTransactionAssignmentStatus.PARTIALLY_ASSIGNED,
        allocations: [{ allocatedAmount: 1500 }],
      },
    ]);
    expect(result.partiallyAssignedCreditAmount).toBe(0);
  });
});

describe("classifyCompanyForBankDashboard", () => {
  it("detects ISE and PCM company codes", () => {
    expect(classifyCompanyForBankDashboard({ code: "ISE", name: "Ivaan" })).toBe("ISE");
    expect(classifyCompanyForBankDashboard({ code: "PCM", name: "PCMV" })).toBe("PCM");
    expect(classifyCompanyForBankDashboard({ code: "PCMV", name: "Practice" })).toBe("PCM");
    expect(classifyCompanyForBankDashboard({ code: "OTHER", name: "Demo" })).toBe("OTHER");
  });
});
