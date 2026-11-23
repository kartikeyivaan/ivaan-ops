import { describe, expect, it } from "vitest";

import {
  classifyScanBatch,
  prepareScanInput,
} from "@/lib/monthly-serial-audit-scan";

describe("prepareScanInput", () => {
  it("splits pasted text, normalises case and whitespace, and removes duplicates", () => {
    const out = prepareScanInput(" ws0001 \nWS0002, ws0001\nWS0003 ");
    expect(out).toEqual(["WS0001", "WS0002", "WS0003"]);
  });

  it("removes scanner format labels such as [CODE 128] and [DATA MATRIX]", () => {
    expect(prepareScanInput("[CODE 128]WS0001\n[DATA MATRIX]WS0002")).toEqual(["WS0001", "WS0002"]);
    expect(prepareScanInput(["[QR]ab12", "[CODE 128]cd34"])).toEqual(["AB12", "CD34"]);
  });

  it("accepts an array and drops empty entries", () => {
    expect(prepareScanInput(["a1", "", " A1 ", "b2"])).toEqual(["A1", "B2"]);
  });
});

describe("classifyScanBatch", () => {
  const snapshot = new Map([
    ["S1", "id-1"],
    ["S2", "id-2"],
  ]);

  it("marks snapshot serials FOUND and others ADDITIONAL", () => {
    const out = classifyScanBatch(["S1", "X9"], new Set(), snapshot);
    expect(out).toEqual([
      { serialNumber: "S1", outcome: "FOUND", matchedSerialId: "id-1" },
      { serialNumber: "X9", outcome: "ADDITIONAL", matchedSerialId: null },
    ]);
  });

  it("reports serials already scanned in this run as ALREADY_SCANNED", () => {
    const out = classifyScanBatch(["S1"], new Set(["S1"]), snapshot);
    expect(out[0].outcome).toBe("ALREADY_SCANNED");
    expect(out[0].matchedSerialId).toBeNull();
  });

  it("treats a second copy of the same serial inside one batch as ALREADY_SCANNED", () => {
    const out = classifyScanBatch(["S2", "S2"], new Set(), snapshot);
    expect(out.map((r) => r.outcome)).toEqual(["FOUND", "ALREADY_SCANNED"]);
  });

  it("does not let an ALREADY_SCANNED serial change the outcome of others", () => {
    const out = classifyScanBatch(["S1", "S2"], new Set(["S1"]), snapshot);
    expect(out.map((r) => r.outcome)).toEqual(["ALREADY_SCANNED", "FOUND"]);
  });
});
