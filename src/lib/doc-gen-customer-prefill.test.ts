import { describe, expect, it } from "vitest";
import { prefillFieldValuesFromCustomerSource } from "@/lib/doc-gen-customer-prefill";

describe("prefillFieldValuesFromCustomerSource", () => {
  it("maps service-request fields onto known set field keys", () => {
    const result = prefillFieldValuesFromCustomerSource({
      availableFieldKeys: [
        "Customer_Name",
        "Mobile_Number",
        "Consumer_Number",
        "Installation_Address",
        "City_Or_Village",
        "Scheme",
      ],
      source: {
        displayName: "Ravi Patil",
        mobileNumber: "9876543210",
        consumerNumber: "CN-1",
        address: "Plot 12",
        city: "Pune",
      },
    });

    expect(result).toEqual({
      Customer_Name: "Ravi Patil",
      Mobile_Number: "9876543210",
      Consumer_Number: "CN-1",
      Installation_Address: "Plot 12",
      City_Or_Village: "Pune",
    });
  });

  it("does not overwrite existing non-empty values by default", () => {
    const result = prefillFieldValuesFromCustomerSource({
      availableFieldKeys: ["Customer_Name", "Mobile_Number"],
      source: { displayName: "New", mobileNumber: "111" },
      existing: { Customer_Name: "Kept", Mobile_Number: "" },
    });
    expect(result.Customer_Name).toBe("Kept");
    expect(result.Mobile_Number).toBe("111");
  });
});
