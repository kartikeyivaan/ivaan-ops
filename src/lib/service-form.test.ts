import { describe, expect, it } from "vitest";
import { ServicePriority, ServiceSystemStatus } from "@prisma/client";
import {
  buildCreateServiceRequestPayload,
  defaultNewServiceRequestValues,
  validateNewServiceRequest,
  type NewServiceRequestFormValues,
} from "@/lib/service-form";

function values(overrides: Partial<NewServiceRequestFormValues> = {}) {
  return { ...defaultNewServiceRequestValues(), ...overrides };
}

describe("validateNewServiceRequest", () => {
  it("requires the mandatory fields", () => {
    const errors = validateNewServiceRequest(values());
    expect(errors.customerName).toBeDefined();
    expect(errors.mobileNumber).toBeDefined();
    expect(errors.workTypeId).toBeDefined();
    expect(errors.customerRequest).toBeDefined();
  });

  it("passes with valid mandatory fields", () => {
    const errors = validateNewServiceRequest(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "9876543210",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: "Inverter not working",
      }),
    );
    expect(errors).toEqual({});
  });

  it("accepts a custom work type instead of a work type id", () => {
    const errors = validateNewServiceRequest(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "9876543210",
        customWorkType: "Special repair",
        customerRequest: "Inverter not working",
      }),
    );
    expect(errors.workTypeId).toBeUndefined();
  });

  it("rejects an invalid mobile number", () => {
    const errors = validateNewServiceRequest(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "12345",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: "Inverter not working",
      }),
    );
    expect(errors.mobileNumber).toBeDefined();
  });

  it("rejects an invalid alternate mobile number", () => {
    const errors = validateNewServiceRequest(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "9876543210",
        alternateMobileNumber: "111",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: "Inverter not working",
      }),
    );
    expect(errors.alternateMobileNumber).toBeDefined();
  });

  it("rejects a negative fee", () => {
    const errors = validateNewServiceRequest(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "9876543210",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: "Inverter not working",
        totalFees: "-5",
      }),
    );
    expect(errors.totalFees).toBeDefined();
  });
});

describe("buildCreateServiceRequestPayload", () => {
  it("includes defaults and omits empty optional values", () => {
    const payload = buildCreateServiceRequestPayload(
      values({
        customerName: "  Ramesh Kumar ",
        mobileNumber: " 9876543210 ",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: " Inverter not working ",
      }),
    );

    expect(payload).toMatchObject({
      customerName: "Ramesh Kumar",
      mobileNumber: "9876543210",
      customerRequest: "Inverter not working",
      priority: ServicePriority.NORMAL,
      systemStatus: ServiceSystemStatus.NOT_CHECKED,
      isChargeable: false,
      workTypeId: "11111111-1111-1111-1111-111111111111",
    });
    expect(payload.consumerNumber).toBeUndefined();
    expect(payload.assignedToUserId).toBeUndefined();
    expect(payload.totalFees).toBeUndefined();
  });

  it("coerces the fee to a number when provided", () => {
    const payload = buildCreateServiceRequestPayload(
      values({
        customerName: "Ramesh Kumar",
        mobileNumber: "9876543210",
        workTypeId: "11111111-1111-1111-1111-111111111111",
        customerRequest: "Inverter not working",
        isChargeable: true,
        totalFees: "1500",
      }),
    );
    expect(payload.totalFees).toBe(1500);
    expect(payload.isChargeable).toBe(true);
  });
});
