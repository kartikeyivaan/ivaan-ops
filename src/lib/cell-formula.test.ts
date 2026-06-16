import { describe, expect, it } from "vitest";
import { evaluateCellInput, evaluateMathExpression } from "@/lib/cell-formula";

describe("cell formula", () => {
  it("evaluates plain numbers", () => {
    expect(evaluateCellInput("100").value).toBe(100);
    expect(evaluateCellInput("12.5").value).toBe(12.5);
  });

  it("evaluates excel-style formulas", () => {
    expect(evaluateCellInput("=20*33").value).toBe(660);
    expect(evaluateCellInput("=100+50*2").value).toBe(200);
    expect(evaluateCellInput("=(10+5)*4").value).toBe(60);
  });

  it("rejects unsafe formula characters", () => {
    expect(evaluateCellInput("=alert(1)").error).toBeTruthy();
    expect(evaluateCellInput("=20;33").error).toBeTruthy();
  });

  it("handles divide by zero", () => {
    expect(() => evaluateMathExpression("10/0")).toThrow(/divide by zero/i);
  });
});
