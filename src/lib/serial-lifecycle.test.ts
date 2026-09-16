import { SerialStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  classifyLoadedSerials,
  describeLiveSerialBlock,
  occupyingSerialNumbers,
  parsePrefixedSerialError,
  productMismatchSerialNumbers,
  reentrySerialNumbers,
} from "@/lib/serial-lifecycle";

function row(input: {
  id: string;
  serialNumber: string;
  status: SerialStatus;
  createdAt: string;
  productId: string;
  productName?: string;
}) {
  return {
    id: input.id,
    serialNumber: input.serialNumber,
    status: input.status,
    createdAt: new Date(input.createdAt),
    productId: input.productId,
    productName: input.productName ?? "Panel A",
  };
}

describe("serial lifecycle occupancy", () => {
  it("treats never-seen serials as new", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["SN-1"],
      rows: [],
      inTransitSerialNumbers: [],
    });
    expect(occupancies[0]?.kind).toBe("new");
  });

  it("blocks live in-stock serials and allows dispatched re-entry", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["LIVE-1", "GONE-1"],
      rows: [
        row({
          id: "1",
          serialNumber: "LIVE-1",
          status: SerialStatus.AVAILABLE,
          createdAt: "2026-01-01",
          productId: "p1",
        }),
        row({
          id: "2",
          serialNumber: "GONE-1",
          status: SerialStatus.DISPATCHED,
          createdAt: "2026-01-01",
          productId: "p1",
        }),
      ],
      inTransitSerialNumbers: [],
    });
    expect(occupyingSerialNumbers(occupancies)).toEqual(["LIVE-1"]);
    expect(reentrySerialNumbers(occupancies)).toEqual(["GONE-1"]);
  });

  it("blocks in-transit dispatched serials even though they are not live stock", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["MOVE-1"],
      rows: [
        row({
          id: "3",
          serialNumber: "MOVE-1",
          status: SerialStatus.DISPATCHED,
          createdAt: "2026-01-01",
          productId: "p1",
        }),
      ],
      inTransitSerialNumbers: ["MOVE-1"],
    });
    expect(occupancies[0]?.kind).toBe("in_transit");
    expect(occupyingSerialNumbers(occupancies)).toEqual(["MOVE-1"]);
    expect(reentrySerialNumbers(occupancies)).toEqual([]);
  });

  it("blocks damaged serials as still in the warehouse", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["DMG-1"],
      rows: [
        row({
          id: "4",
          serialNumber: "DMG-1",
          status: SerialStatus.DAMAGED,
          createdAt: "2026-01-01",
          productId: "p1",
        }),
      ],
      inTransitSerialNumbers: [],
    });
    expect(occupancies[0]?.kind).toBe("live");
    expect(occupancies[0]?.reason).toBe(describeLiveSerialBlock(SerialStatus.DAMAGED));
  });

  it("prefers the live cycle when an older dispatched cycle exists", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["SN-1"],
      rows: [
        row({
          id: "old",
          serialNumber: "SN-1",
          status: SerialStatus.DISPATCHED,
          createdAt: "2026-01-01",
          productId: "p1",
          productName: "Panel A",
        }),
        row({
          id: "new",
          serialNumber: "SN-1",
          status: SerialStatus.AVAILABLE,
          createdAt: "2026-06-01",
          productId: "p2",
          productName: "Panel B",
        }),
      ],
      inTransitSerialNumbers: [],
    });
    expect(occupancies[0]).toMatchObject({
      kind: "live",
      lastCycleId: "new",
      lastProductId: "p2",
    });
  });

  it("flags product mismatch only for re-entry against a different SKU", () => {
    const occupancies = classifyLoadedSerials({
      serialNumbers: ["SN-1"],
      rows: [
        row({
          id: "old",
          serialNumber: "SN-1",
          status: SerialStatus.REMOVED,
          createdAt: "2026-01-01",
          productId: "p1",
          productName: "Panel A",
        }),
      ],
      inTransitSerialNumbers: [],
    });
    expect(productMismatchSerialNumbers(occupancies, "p2")).toEqual(["SN-1"]);
    expect(productMismatchSerialNumbers(occupancies, "p1")).toEqual([]);
  });

  it("parses prefixed occupancy errors", () => {
    expect(parsePrefixedSerialError("SERIAL_IN_TRANSIT:ABC")).toEqual({
      code: "SERIAL_IN_TRANSIT",
      serialNumber: "ABC",
    });
  });
});
