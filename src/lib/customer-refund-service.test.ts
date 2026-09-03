import { describe, expect, it } from "vitest";
import type { CustomerRefundStatus } from "@prisma/client";
import {
  isValidIfsc,
  isValidRefundAccountNumber,
  normalizeAccountNumber,
  normalizeIfsc,
  normalizeUtr,
  RESERVING_REFUND_STATUSES,
  roundMoney,
  summarizeRefundableAmount,
} from "@/lib/customer-refund-service";
import {
  CUSTOMER_REFUND_APPROVAL_QUEUE_STATUSES,
  CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES,
  CUSTOMER_REFUND_REASON_LABELS,
  CUSTOMER_REFUND_STATUS_LABELS,
  isCustomerRefundEditable,
  isCustomerRefundLocked,
  isCustomerRefundTerminal,
} from "@/lib/customer-refund-constants";

type Row = {
  id: string;
  status: CustomerRefundStatus;
  requestedAmount: number;
  approvedAmount: number | null;
  actualRefundAmount: number | null;
};

function row(
  id: string,
  status: CustomerRefundStatus,
  requestedAmount: number,
  approvedAmount: number | null = null,
  actualRefundAmount: number | null = null,
): Row {
  return { id, status, requestedAmount, approvedAmount, actualRefundAmount };
}

describe("summarizeRefundableAmount", () => {
  it("matches the worked example: 4,50,000 received less 1,00,000 refunded", () => {
    const summary = summarizeRefundableAmount(450000, [
      row("r1", "REFUNDED", 100000, 100000, 100000),
    ]);

    expect(summary.receivedAmount).toBe(450000);
    expect(summary.previousRefundedAmount).toBe(100000);
    expect(summary.reservedAmount).toBe(0);
    expect(summary.availableRefundAmount).toBe(350000);
  });

  it("returns the full receipt when there are no refunds", () => {
    const summary = summarizeRefundableAmount(450000, []);
    expect(summary.previousRefundedAmount).toBe(0);
    expect(summary.availableRefundAmount).toBe(450000);
  });

  it("reserves in-flight refunds so two requests cannot claim the same money", () => {
    const summary = summarizeRefundableAmount(450000, [
      row("r1", "PENDING_APPROVAL", 200000),
    ]);

    expect(summary.previousRefundedAmount).toBe(0);
    expect(summary.reservedAmount).toBe(200000);
    expect(summary.availableRefundAmount).toBe(250000);
  });

  it("reserves drafts, approved, processing and failed refunds", () => {
    for (const status of RESERVING_REFUND_STATUSES) {
      const summary = summarizeRefundableAmount(100000, [row("r1", status, 40000)]);
      expect(summary.reservedAmount).toBe(40000);
      expect(summary.availableRefundAmount).toBe(60000);
    }
  });

  it("releases headroom for rejected and cancelled refunds", () => {
    for (const status of ["REJECTED", "CANCELLED"] as CustomerRefundStatus[]) {
      const summary = summarizeRefundableAmount(100000, [row("r1", status, 40000)]);
      expect(summary.reservedAmount).toBe(0);
      expect(summary.previousRefundedAmount).toBe(0);
      expect(summary.availableRefundAmount).toBe(100000);
    }
  });

  it("uses the approved amount for reservation once a refund is approved", () => {
    const summary = summarizeRefundableAmount(100000, [
      row("r1", "APPROVED", 50000, 30000),
    ]);
    expect(summary.reservedAmount).toBe(30000);
    expect(summary.availableRefundAmount).toBe(70000);
  });

  it("counts the actual paid amount for completed refunds, not the requested one", () => {
    const summary = summarizeRefundableAmount(100000, [
      row("r1", "REFUNDED", 50000, 50000, 40000),
    ]);
    expect(summary.previousRefundedAmount).toBe(40000);
    expect(summary.availableRefundAmount).toBe(60000);
  });

  it("excludes the refund being edited so its own amount is not double-counted", () => {
    const rows = [row("r1", "DRAFT", 200000), row("r2", "REFUNDED", 50000, 50000, 50000)];

    const withoutExclusion = summarizeRefundableAmount(450000, rows);
    expect(withoutExclusion.availableRefundAmount).toBe(200000);

    const editingR1 = summarizeRefundableAmount(450000, rows, {
      excludeRefundId: "r1",
    });
    expect(editingR1.reservedAmount).toBe(0);
    expect(editingR1.previousRefundedAmount).toBe(50000);
    expect(editingR1.availableRefundAmount).toBe(400000);
  });

  it("combines completed and in-flight refunds across several requests", () => {
    const summary = summarizeRefundableAmount(450000, [
      row("r1", "REFUNDED", 100000, 100000, 100000),
      row("r2", "PENDING_APPROVAL", 50000),
      row("r3", "APPROVED", 75000, 75000),
      row("r4", "CANCELLED", 90000),
    ]);

    expect(summary.previousRefundedAmount).toBe(100000);
    expect(summary.reservedAmount).toBe(125000);
    expect(summary.availableRefundAmount).toBe(225000);
  });

  it("never reports a negative available amount", () => {
    const summary = summarizeRefundableAmount(100000, [
      row("r1", "REFUNDED", 80000, 80000, 80000),
      row("r2", "APPROVED", 50000, 50000),
    ]);
    expect(summary.availableRefundAmount).toBe(0);
  });

  it("keeps paise-level amounts exact", () => {
    const summary = summarizeRefundableAmount(1000.05, [
      row("r1", "REFUNDED", 333.35, 333.35, 333.35),
      row("r2", "PENDING_APPROVAL", 333.35),
    ]);
    expect(summary.previousRefundedAmount).toBe(333.35);
    expect(summary.reservedAmount).toBe(333.35);
    expect(summary.availableRefundAmount).toBe(333.35);
  });
});

describe("roundMoney", () => {
  it("rounds to two decimals without float drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1234.005)).toBe(1234.01);
    expect(roundMoney(99999.999)).toBe(100000);
  });
});

describe("IFSC validation", () => {
  it("accepts valid IFSC codes", () => {
    for (const code of ["HDFC0001234", "SBIN0000456", "ICIC0X1Y2Z3"]) {
      expect(isValidIfsc(code)).toBe(true);
    }
  });

  it("rejects malformed IFSC codes", () => {
    for (const code of [
      "HDFC1001234", // 5th char must be 0
      "HDF0001234", // too few letters
      "HDFC000123", // too short
      "HDFC00012345", // too long
      "1234000ABCD", // starts with digits
      "",
    ]) {
      expect(isValidIfsc(code)).toBe(false);
    }
  });

  it("normalizes case and whitespace before validating", () => {
    expect(normalizeIfsc(" hdfc0001234 ")).toBe("HDFC0001234");
    expect(isValidIfsc(" hdfc0001234 ")).toBe(true);
  });
});

describe("refund account number validation", () => {
  it("accepts 9 to 18 digit account numbers", () => {
    expect(isValidRefundAccountNumber("123456789")).toBe(true);
    expect(isValidRefundAccountNumber("123456789012345678")).toBe(true);
    expect(isValidRefundAccountNumber("50100 1234 5678")).toBe(true);
  });

  it("rejects too short, too long or non-numeric account numbers", () => {
    expect(isValidRefundAccountNumber("12345678")).toBe(false);
    expect(isValidRefundAccountNumber("1234567890123456789")).toBe(false);
    expect(isValidRefundAccountNumber("ABCD12345678")).toBe(false);
    expect(isValidRefundAccountNumber("")).toBe(false);
  });

  it("strips whitespace when normalizing", () => {
    expect(normalizeAccountNumber(" 5010 0123 4567 ")).toBe("501001234567");
  });
});

describe("normalizeUtr", () => {
  it("uppercases and removes whitespace", () => {
    expect(normalizeUtr(" utr 1234 abcd ")).toBe("UTR1234ABCD");
  });
});

describe("refund status helpers", () => {
  it("locks approved, processing and refunded requests", () => {
    expect(isCustomerRefundLocked("APPROVED")).toBe(true);
    expect(isCustomerRefundLocked("PROCESSING")).toBe(true);
    expect(isCustomerRefundLocked("REFUNDED")).toBe(true);
  });

  it("leaves draft and pending-approval requests unlocked", () => {
    expect(isCustomerRefundLocked("DRAFT")).toBe(false);
    expect(isCustomerRefundLocked("PENDING_APPROVAL")).toBe(false);
  });

  it("treats refunded, rejected and cancelled as terminal", () => {
    expect(isCustomerRefundTerminal("REFUNDED")).toBe(true);
    expect(isCustomerRefundTerminal("REJECTED")).toBe(true);
    expect(isCustomerRefundTerminal("CANCELLED")).toBe(true);
    expect(isCustomerRefundTerminal("APPROVED")).toBe(false);
  });

  it("only allows editing drafts", () => {
    expect(isCustomerRefundEditable("DRAFT")).toBe(true);
    for (const status of [
      "PENDING_APPROVAL",
      "APPROVED",
      "PROCESSING",
      "REFUNDED",
      "REJECTED",
      "CANCELLED",
      "FAILED",
    ] as CustomerRefundStatus[]) {
      expect(isCustomerRefundEditable(status)).toBe(false);
    }
  });

  it("routes each queue to the right stage", () => {
    expect(CUSTOMER_REFUND_APPROVAL_QUEUE_STATUSES).toEqual(["PENDING_APPROVAL"]);
    expect(CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES).toContain("APPROVED");
    expect(CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES).not.toContain("PENDING_APPROVAL");
    expect(CUSTOMER_REFUND_EXECUTION_QUEUE_STATUSES).not.toContain("REFUNDED");
  });

  it("labels every status and reason", () => {
    for (const label of Object.values(CUSTOMER_REFUND_STATUS_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(CUSTOMER_REFUND_REASON_LABELS.OTHER).toBe("Other");
    expect(CUSTOMER_REFUND_REASON_LABELS.ORDER_CANCELLED).toBe("Order Cancelled");
  });
});

describe("executed amount guard", () => {
  // Mirrors the server-side rule in processCustomerRefund.
  function exceedsApproved(actual: number, approved: number): boolean {
    return actual > approved;
  }

  it("allows an executed amount equal to or below the approved amount", () => {
    expect(exceedsApproved(100000, 100000)).toBe(false);
    expect(exceedsApproved(90000, 100000)).toBe(false);
  });

  it("rejects an executed amount above the approved amount", () => {
    expect(exceedsApproved(100000.01, 100000)).toBe(true);
  });
});
