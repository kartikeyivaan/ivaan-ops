import { describe, expect, it } from "vitest";
import {
  BOOKING_ADVANCE_PERCENT,
  buildDispatchTodayApprovalCopy,
  calculateAdvanceRequired,
  calculateOutstanding,
  canRecordPaymentAgainstPi,
  canManageExistingPiPayment,
  canRequestBooking,
  daysUntilCommittedDispatch,
  formatDispatchTodayApprovalMessage,
  formatDispatchTodayConfirmationMessage,
  isDispatchTodayActive,
  isOutstandingWithinTolerance,
  isReadyForDispatch,
  maxPaymentAmountOnEdit,
  needsEarlyDispatchTodayApproval,
  PAYMENT_OUTSTANDING_TOLERANCE_INR,
  resolveBookingRequirement,
} from "@/lib/proforma-invoices";
import {
  canApproveBooking,
  canApproveDispatchToday,
  canManageProformaInvoices,
  canMarkDispatchToday,
  canRecallDispatchToday,
  canRecordPayments,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
import {
  bookingShortageQty,
  resolveBookingStockDecision,
  resolveCoverageProjectionEndDate,
} from "@/lib/pi-service";
import { ROLES } from "@/lib/rbac";

describe("proforma invoice calculations", () => {
  it("calculates advance required from the committed percentage", () => {
    expect(calculateAdvanceRequired(100000)).toBe(50000);
    expect(calculateAdvanceRequired(100000, 30)).toBe(30000);
    expect(BOOKING_ADVANCE_PERCENT).toBe(50);
  });

  it("calculates outstanding as PI value minus payments", () => {
    expect(calculateOutstanding(100000, 40000)).toBe(60000);
    expect(calculateOutstanding(100000, 120000)).toBe(0);
  });

  it("allows booking only when advance is met", () => {
    expect(canRequestBooking(100000, 50000)).toBe(true);
    expect(canRequestBooking(100000, 49999)).toBe(false);
    expect(
      canRequestBooking(100000, 30000, {
        allowed: true,
        requiredPaymentPercent: 30,
      }),
    ).toBe(true);
    expect(
      canRequestBooking(100000, 29999, {
        allowed: true,
        requiredPaymentPercent: 30,
      }),
    ).toBe(false);
  });

  it("allows booking when outstanding is under the ₹10 tolerance", () => {
    expect(PAYMENT_OUTSTANDING_TOLERANCE_INR).toBe(10);
    expect(isOutstandingWithinTolerance(9.99)).toBe(true);
    expect(isOutstandingWithinTolerance(10)).toBe(false);
    expect(canRequestBooking(100000, 99991)).toBe(true);
    expect(
      canRequestBooking(100000, 99991, {
        allowed: true,
        requiredPaymentPercent: 100,
      }),
    ).toBe(true);
    expect(
      canRequestBooking(100000, 99990, {
        allowed: true,
        requiredPaymentPercent: 100,
      }),
    ).toBe(false);
  });

  it("allows remaining payments after booking while outstanding", () => {
    expect(canRecordPaymentAgainstPi("BOOKED", 50000)).toBe(true);
    expect(canRecordPaymentAgainstPi("PARTIALLY_DISPATCHED", 1000)).toBe(true);
    expect(canRecordPaymentAgainstPi("BOOKED", 0)).toBe(false);
    expect(canRecordPaymentAgainstPi("FULLY_DISPATCHED", 100)).toBe(true);
  });

  it("allows editing existing payments except on draft or cancelled PIs", () => {
    expect(canManageExistingPiPayment("ISSUED")).toBe(true);
    expect(canManageExistingPiPayment("BOOKED")).toBe(true);
    expect(canManageExistingPiPayment("FULLY_DISPATCHED")).toBe(true);
    expect(canManageExistingPiPayment("DRAFT")).toBe(false);
    expect(canManageExistingPiPayment("CANCELLED")).toBe(false);
    expect(canManageExistingPiPayment("CANCEL_PENDING")).toBe(false);
  });

  it("caps edited payment amount to outstanding plus the current payment", () => {
    expect(maxPaymentAmountOnEdit(100000, 40000, 10000)).toBe(70000);
    expect(maxPaymentAmountOnEdit(100000, 100000, 25000)).toBe(25000);
  });

  it("marks booked PIs ready for dispatch when outstanding is under ₹10", () => {
    expect(isReadyForDispatch("BOOKED", 0)).toBe(true);
    expect(isReadyForDispatch("BOOKED", 9.99)).toBe(true);
    expect(isReadyForDispatch("BOOKED", 10)).toBe(false);
    expect(isReadyForDispatch("PARTIALLY_DISPATCHED", 0)).toBe(true);
    expect(isReadyForDispatch("PARTIALLY_DISPATCHED", 5)).toBe(true);
    expect(isReadyForDispatch("ISSUED", 0)).toBe(false);
  });

  it("allows dispatch with approved credit when outstanding remains", () => {
    expect(isReadyForDispatch("BOOKED", 50000, { hasApprovedCredit: true })).toBe(true);
    expect(isReadyForDispatch("BOOKED", 50000, { hasApprovedCredit: false })).toBe(false);
    expect(isReadyForDispatch("ISSUED", 50000, { hasApprovedCredit: true })).toBe(false);
  });

  it("computes days until committed dispatch and early-approval need", () => {
    expect(daysUntilCommittedDispatch("2026-08-05", "2026-07-30")).toBe(6);
    expect(daysUntilCommittedDispatch("2026-07-30", "2026-07-30")).toBe(0);
    expect(daysUntilCommittedDispatch("2026-07-28", "2026-07-30")).toBe(-2);
    expect(needsEarlyDispatchTodayApproval("2026-08-05", "2026-07-30")).toBe(true);
    expect(needsEarlyDispatchTodayApproval("2026-07-30", "2026-07-30")).toBe(false);
    expect(isDispatchTodayActive("2026-07-30", "2026-07-30")).toBe(true);
    expect(isDispatchTodayActive("2026-07-29", "2026-07-30")).toBe(false);
  });

  it("builds a single clear approval message for early and stock transfer", () => {
    const both = buildDispatchTodayApprovalCopy({
      daysUntil: 3,
      needsEarly: true,
      fromCompanyCode: "ISE",
    });
    expect(both.title).toBe("Early dispatch & stock transfer approval needed");
    expect(both.remarks).toContain("Early dispatch approval (3 day(s) before committed delivery)");
    expect(both.remarks).toContain("Stock transfer approval from ISE");
    expect(both.remarks).toContain("; ");

    expect(
      formatDispatchTodayApprovalMessage("PCMV-PI-26-27-00045", {
        daysUntil: 3,
        needsEarly: true,
        fromCompanyCode: "ISE",
      }),
    ).toContain("early dispatch and stock transfer");

    expect(
      formatDispatchTodayConfirmationMessage({
        daysUntil: 3,
        needsEarly: true,
        fromCompanyCode: "ISE",
        committedDate: "2026-08-08",
      }),
    ).toMatch(/committed delivery is after 3 day\(s\) \(2026-08-08\).*stock will be transferred from ISE/i);

    const earlyOnly = buildDispatchTodayApprovalCopy({
      daysUntil: 3,
      needsEarly: true,
      fromCompanyCode: null,
    });
    expect(earlyOnly.title).toBe("Early dispatch approval needed");
    expect(earlyOnly.remarks).not.toContain("Stock transfer");

    const stockOnly = buildDispatchTodayApprovalCopy({
      daysUntil: 0,
      needsEarly: false,
      fromCompanyCode: "ISE",
    });
    expect(stockOnly.title).toBe("Stock transfer approval needed");
    expect(stockOnly.remarks).toBe("Stock transfer approval from ISE");
  });

  it("uses PI terms before quotation and legacy defaults", () => {
    expect(
      resolveBookingRequirement(
        { requiredPaymentPercent: 80 },
        { requiredPaymentPercent: 60 },
      ).requiredPaymentPercent,
    ).toBe(80);
    expect(
      resolveBookingRequirement({
        deliveryTermMode: "ADVANCE_BOOKING",
        bookingAllowed: true,
        requiredPaymentPercent: 30,
      }).requiredPaymentPercent,
    ).toBe(30);
    expect(resolveBookingRequirement({}).requiredPaymentPercent).toBe(50);
  });

  it("requires full payment for ready stock within ₹10 tolerance", () => {
    const requirement = resolveBookingRequirement({
      deliveryTermMode: "READY_STOCK",
      bookingAllowed: true,
      requiredPaymentPercent: 50,
    });
    expect(requirement.requiredPaymentPercent).toBe(100);
    expect(canRequestBooking(100000, 99991, requirement)).toBe(true);
    expect(canRequestBooking(100000, 99990, requirement)).toBe(false);
  });

  it("blocks subject-to-availability and unapproved legacy terms", () => {
    expect(
      resolveBookingRequirement({
        deliveryTermMode: "SUBJECT_TO_AVAILABILITY",
        bookingAllowed: true,
      }).allowed,
    ).toBe(false);
    expect(resolveBookingRequirement({ deliveryTermMode: "LEGACY" }).allowed).toBe(false);
    expect(
      resolveBookingRequirement({
        deliveryTermMode: "LEGACY",
        bookingAllowed: true,
      }).allowed,
    ).toBe(true);
  });
});

describe("proforma invoice permissions", () => {
  it("allows sales and accounts to view", () => {
    expect(canViewProformaInvoices([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canViewProformaInvoices([ROLES.ACCOUNTS])).toBe(true);
    expect(canViewProformaInvoices([ROLES.PURCHASE])).toBe(false);
  });

  it("allows sales to manage and record payments", () => {
    expect(canManageProformaInvoices([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canRecordPayments([ROLES.ACCOUNTS])).toBe(true);
    expect(canRecordPayments([ROLES.SALES_EXECUTIVE])).toBe(true);
  });

  it("allows manager to approve booking", () => {
    expect(canApproveBooking([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApproveBooking([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows sales to mark dispatch today and managers to approve early", () => {
    expect(canMarkDispatchToday([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canMarkDispatchToday([ROLES.SALES_MANAGER])).toBe(true);
    expect(canMarkDispatchToday([ROLES.WAREHOUSE])).toBe(false);
    expect(canApproveDispatchToday([ROLES.SALES_MANAGER])).toBe(true);
    expect(canApproveDispatchToday([ROLES.SALES_EXECUTIVE])).toBe(false);
  });

  it("allows sales to recall dispatch today", () => {
    expect(canRecallDispatchToday([ROLES.SALES_EXECUTIVE])).toBe(true);
    expect(canRecallDispatchToday([ROLES.SALES_MANAGER])).toBe(true);
    expect(canRecallDispatchToday([ROLES.WAREHOUSE])).toBe(false);
  });
});

describe("cross-company booking stock decision", () => {
  const shortage = [
    {
      productId: "p1",
      displayName: "Modules - Waaree - TOPCon N-DCR - 580 Wp",
      requiredQty: 2,
      localProjectedAvailable: 0,
      shortageQty: 2,
    },
  ];

  it("allows booking when local projected stock is enough", () => {
    expect(
      resolveBookingStockDecision({
        shortages: [],
        coveringCompanyCodes: [],
        allowCrossCompanyShortfall: false,
      }),
    ).toBe("OK");
  });

  it("requires approval when another company can cover the shortfall", () => {
    expect(
      resolveBookingStockDecision({
        shortages: shortage,
        coveringCompanyCodes: ["ISE"],
        allowCrossCompanyShortfall: false,
      }),
    ).toBe("NEED_APPROVAL");
  });

  it("allows approved booking when another company covers the shortfall", () => {
    expect(
      resolveBookingStockDecision({
        shortages: shortage,
        coveringCompanyCodes: ["ISE"],
        allowCrossCompanyShortfall: true,
      }),
    ).toBe("OK");
  });

  it("blocks booking when no company can cover the shortfall", () => {
    expect(
      resolveBookingStockDecision({
        shortages: shortage,
        coveringCompanyCodes: [],
        allowCrossCompanyShortfall: true,
      }),
    ).toBe("UNAVAILABLE");
  });
});

describe("booking coverage projection window", () => {
  it("extends the coverage end date through pending incoming max dates", () => {
    expect(
      resolveCoverageProjectionEndDate("2026-08-05", [
        "2026-08-08",
        null,
        "2026-08-06",
      ]),
    ).toBe("2026-08-08");
    expect(resolveCoverageProjectionEndDate("2026-08-05", [])).toBe(
      "2026-08-05",
    );
  });

  it("does not inflate shortage when projected stock is already negative", () => {
    expect(bookingShortageQty(54, -708)).toBe(54);
    expect(bookingShortageQty(54, 10)).toBe(44);
    expect(bookingShortageQty(54, 100)).toBe(0);
  });
});
