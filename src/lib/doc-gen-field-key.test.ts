import { describe, expect, it } from "vitest";
import { isValidDocGenFieldKey } from "@/lib/doc-gen-field-key";

describe("doc gen field keys", () => {
  it("accepts Pascal_Snake keys", () => {
    expect(isValidDocGenFieldKey("Customer_Name")).toBe(true);
    expect(isValidDocGenFieldKey("Consumer_ID")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(isValidDocGenFieldKey("customer_name")).toBe(false);
    expect(isValidDocGenFieldKey("")).toBe(false);
    expect(isValidDocGenFieldKey("123_Start")).toBe(false);
  });
});
