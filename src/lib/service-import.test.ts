import { describe, expect, it } from "vitest";
import { ServiceStatus } from "@prisma/client";
import {
  mapServiceImportHeader,
  parseServiceImportDate,
  parseServiceImportNumber,
  parseServiceImportStatus,
  validateServiceImportRow,
  type ServiceImportInput,
} from "@/lib/service-import";

const KNOWN = new Set(["pending civil work", "inverter complaint"]);

describe("mapServiceImportHeader", () => {
  it("maps known header variants", () => {
    expect(mapServiceImportHeader("#")).toBe("serial");
    expect(mapServiceImportHeader("Sr No")).toBe("serial");
    expect(mapServiceImportHeader("Customer Name")).toBe("customerName");
    expect(mapServiceImportHeader("Consumer #")).toBe("consumerNumber");
    expect(mapServiceImportHeader("Work Type")).toBe("workType");
    expect(mapServiceImportHeader("Amount Received")).toBe("amountReceived");
    expect(mapServiceImportHeader("Delayed Notes")).toBe("delayedNotes");
    expect(mapServiceImportHeader("Unknown Column")).toBeNull();
  });
});

describe("parseServiceImportStatus", () => {
  it("maps aliases and defaults blank to OPEN", () => {
    expect(parseServiceImportStatus("")).toBe(ServiceStatus.OPEN);
    expect(parseServiceImportStatus("In Progress")).toBe(ServiceStatus.IN_PROGRESS);
    expect(parseServiceImportStatus("done")).toBe(ServiceStatus.COMPLETED);
    expect(parseServiceImportStatus("Closed")).toBe(ServiceStatus.CLOSED);
    expect(parseServiceImportStatus("banana")).toBeNull();
  });
});

describe("parseServiceImportNumber", () => {
  it("strips currency formatting and returns null for garbage", () => {
    expect(parseServiceImportNumber("")).toBe(0);
    expect(parseServiceImportNumber("₹1,500")).toBe(1500);
    expect(parseServiceImportNumber("2000.50")).toBe(2000.5);
    expect(parseServiceImportNumber("abc")).toBeNull();
  });
});

describe("parseServiceImportDate", () => {
  it("parses dd/mm/yyyy and iso, rejects invalid", () => {
    expect(parseServiceImportDate("10/06/2026")).toBe("2026-06-10");
    expect(parseServiceImportDate("2026-06-10")).toBe("2026-06-10");
    expect(parseServiceImportDate("not-a-date")).toBeNull();
  });
});

describe("validateServiceImportRow", () => {
  function base(overrides: Partial<ServiceImportInput> = {}): ServiceImportInput {
    return {
      rowNumber: 2,
      customerName: "Ramesh Kumar",
      workType: "Inverter Complaint",
      date: "10/06/2026",
      status: "Completed",
      fees: "5000",
      amountReceived: "2000",
      ...overrides,
    };
  }

  it("normalizes a valid row and matches work type", () => {
    const row = validateServiceImportRow(base(), KNOWN);
    expect(row.isValid).toBe(true);
    expect(row.matchedWorkType).toBe(true);
    expect(row.status).toBe(ServiceStatus.COMPLETED);
    expect(row.totalFees).toBe(5000);
    expect(row.amountReceived).toBe(2000);
    expect(row.requestDate).toBe("2026-06-10");
  });

  it("treats unknown work type as custom but still valid", () => {
    const row = validateServiceImportRow(base({ workType: "Special Repair" }), KNOWN);
    expect(row.isValid).toBe(true);
    expect(row.matchedWorkType).toBe(false);
    expect(row.workTypeName).toBe("Special Repair");
  });

  it("flags missing customer name and unknown status", () => {
    const row = validateServiceImportRow(
      base({ customerName: "", status: "weird" }),
      KNOWN,
    );
    expect(row.isValid).toBe(false);
    expect(row.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts a blank mobile number for history", () => {
    const row = validateServiceImportRow(base({ mobileNumber: "" }), KNOWN);
    expect(row.isValid).toBe(true);
    expect(row.mobileNumber).toBeNull();
  });
});
