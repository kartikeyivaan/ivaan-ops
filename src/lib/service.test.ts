import { describe, expect, it } from "vitest";
import { ServiceStatus } from "@prisma/client";
import {
  calculatePendingAmount,
  calculateServiceDelay,
  getManualNextServiceStatuses,
  getNextServiceStatuses,
  isValidIndianMobile,
  isValidServiceStatusTransition,
  normalizeMobileNumber,
  statusRequiresNote,
  statusRequiresWaitingReason,
  suggestTargetCompletionDate,
} from "@/lib/service";
import { getFinancialYear } from "@/lib/inventory";

describe("service status transitions", () => {
  it("allows the PRD transitions and rejects others", () => {
    expect(isValidServiceStatusTransition(ServiceStatus.OPEN, ServiceStatus.ASSIGNED)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.OPEN, ServiceStatus.IN_PROGRESS)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.OPEN, ServiceStatus.CANCELLED)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.ASSIGNED, ServiceStatus.COMPLETED)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.COMPLETED, ServiceStatus.CLOSED)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.CLOSED, ServiceStatus.REOPENED)).toBe(true);
    expect(isValidServiceStatusTransition(ServiceStatus.REOPENED, ServiceStatus.ASSIGNED)).toBe(true);

    // Invalid transitions
    expect(isValidServiceStatusTransition(ServiceStatus.OPEN, ServiceStatus.COMPLETED)).toBe(false);
    expect(isValidServiceStatusTransition(ServiceStatus.OPEN, ServiceStatus.CLOSED)).toBe(false);
    expect(isValidServiceStatusTransition(ServiceStatus.CANCELLED, ServiceStatus.OPEN)).toBe(false);
    expect(isValidServiceStatusTransition(ServiceStatus.CLOSED, ServiceStatus.IN_PROGRESS)).toBe(false);
  });

  it("cancelled is terminal", () => {
    expect(getNextServiceStatuses(ServiceStatus.CANCELLED)).toHaveLength(0);
  });

  it("excludes dedicated-action statuses from the manual status change list", () => {
    const manual = getManualNextServiceStatuses(ServiceStatus.ASSIGNED);
    expect(manual).toContain(ServiceStatus.IN_PROGRESS);
    expect(manual).toContain(ServiceStatus.WAITING);
    expect(manual).toContain(ServiceStatus.CANCELLED);
    expect(manual).not.toContain(ServiceStatus.COMPLETED);

    // A completed request can only be closed/reopened via dedicated actions.
    expect(getManualNextServiceStatuses(ServiceStatus.COMPLETED)).toHaveLength(0);
  });

  it("requires notes and waiting reason for the correct statuses", () => {
    for (const status of [
      ServiceStatus.WAITING,
      ServiceStatus.COMPLETED,
      ServiceStatus.CANCELLED,
      ServiceStatus.REOPENED,
    ]) {
      expect(statusRequiresNote(status)).toBe(true);
    }
    expect(statusRequiresNote(ServiceStatus.IN_PROGRESS)).toBe(false);
    expect(statusRequiresWaitingReason(ServiceStatus.WAITING)).toBe(true);
    expect(statusRequiresWaitingReason(ServiceStatus.COMPLETED)).toBe(false);
  });
});

describe("service pending amount", () => {
  it("computes pending as total minus received, never negative", () => {
    expect(calculatePendingAmount(5000, 2000)).toBe(3000);
    expect(calculatePendingAmount(5000, 5000)).toBe(0);
    expect(calculatePendingAmount(5000, 8000)).toBe(0);
    expect(calculatePendingAmount(0, 0)).toBe(0);
  });
});

describe("service delay", () => {
  const target = new Date("2026-06-10");

  it("returns null status without a target date", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: null,
      status: ServiceStatus.IN_PROGRESS,
      now: new Date("2026-06-20"),
    });
    expect(result.delayStatus).toBeNull();
    expect(result.delayDays).toBe(0);
  });

  it("flags delayed open requests using the current date", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: target,
      status: ServiceStatus.IN_PROGRESS,
      now: new Date("2026-06-15"),
    });
    expect(result.delayDays).toBe(5);
    expect(result.delayStatus).toBe("DELAYED");
  });

  it("flags due today", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: target,
      status: ServiceStatus.ASSIGNED,
      now: new Date("2026-06-10"),
    });
    expect(result.delayDays).toBe(0);
    expect(result.delayStatus).toBe("DUE_TODAY");
  });

  it("is on track before the target", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: target,
      status: ServiceStatus.ASSIGNED,
      now: new Date("2026-06-05"),
    });
    expect(result.delayStatus).toBe("ON_TRACK");
  });

  it("uses the closed date for closed requests", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: target,
      status: ServiceStatus.CLOSED,
      closedDate: new Date("2026-06-12"),
      now: new Date("2026-07-01"),
    });
    expect(result.delayDays).toBe(2);
    expect(result.delayStatus).toBe("DELAYED");
  });

  it("never shows delay for cancelled requests", () => {
    const result = calculateServiceDelay({
      targetCompletionDate: target,
      status: ServiceStatus.CANCELLED,
      now: new Date("2026-07-01"),
    });
    expect(result.delayStatus).toBeNull();
    expect(result.delayDays).toBe(0);
  });

  it("suggests a target date from work type default days", () => {
    const suggested = suggestTargetCompletionDate(new Date("2026-06-01"), 7);
    expect(suggested?.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(suggestTargetCompletionDate(new Date("2026-06-01"), null)).toBeNull();
    expect(suggestTargetCompletionDate(new Date("2026-06-01"), 0)).toBeNull();
  });
});

describe("service mobile validation", () => {
  it("normalizes and validates indian mobile numbers", () => {
    expect(normalizeMobileNumber("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobileNumber("91 9876543210")).toBe("9876543210");
    expect(normalizeMobileNumber("09876543210")).toBe("9876543210");
    expect(normalizeMobileNumber("98765-43210")).toBe("9876543210");
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("98765 43210")).toBe(true);
    expect(isValidIndianMobile("+91 98765 43210")).toBe(true);
    expect(isValidIndianMobile("1234567890")).toBe(false);
    expect(isValidIndianMobile("98765")).toBe(false);
  });
});

describe("service request number format", () => {
  it("matches the ISE-SRV-FY-##### pattern", () => {
    const fy = getFinancialYear(new Date("2026-06-16"));
    expect(fy).toBe("26-27");
    expect(`ISE-SRV-${fy}-00001`).toMatch(/^ISE-SRV-\d{2}-\d{2}-\d{5}$/);
  });
});
