import { describe, expect, it } from "vitest";
import {
  BOOKING_ADVANCE_PERCENT,
  calculateAdvanceRequired,
  calculateOutstanding,
  canRecordPaymentAgainstPi,
  canRequestBooking,
  daysUntilCommittedDispatch,
  isDispatchTodayActive,
  isReadyForDispatch,
  needsEarlyDispatchTodayApproval,
  resolveBookingRequirement,
} from "@/lib/proforma-invoices";
import {
  canApproveBooking,
  canApproveDispatchToday,
  canManageProformaInvoices,
  canMarkDispatchToday,
  canRecordPayments,
  canViewProformaInvoices,
} from "@/lib/pi-permissions";
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

  it("allows remaining payments after booking while outstanding", () => {
    expect(canRecordPaymentAgainstPi("BOOKED", 50000)).toBe(true);
    expect(canRecordPaymentAgainstPi("PARTIALLY_DISPATCHED", 1000)).toBe(true);
    expect(canRecordPaymentAgainstPi("BOOKED", 0)).toBe(false);
    expect(canRecordPaymentAgainstPi("FULLY_DISPATCHED", 100)).toBe(false);
  });

  it("marks booked PIs ready for dispatch only when fully paid", () => {
    expect(isReadyForDispatch("BOOKED", 0)).toBe(true);
    expect(isReadyForDispatch("BOOKED", 1)).toBe(false);
    expect(isReadyForDispatch("PARTIALLY_DISPATCHED", 0)).toBe(true);
    expect(isReadyForDispatch("ISSUED", 0)).toBe(false);
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

  it("requires full payment for ready stock", () => {
    const requirement = resolveBookingRequirement({
      deliveryTermMode: "READY_STOCK",
      bookingAllowed: true,
      requiredPaymentPercent: 50,
    });
    expect(requirement.requiredPaymentPercent).toBe(100);
    expect(canRequestBooking(100000, 99999, requirement)).toBe(false);
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
});
