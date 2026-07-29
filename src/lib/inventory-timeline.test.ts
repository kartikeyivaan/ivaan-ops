import { describe, expect, it } from "vitest";

import {
  getInventoryTimelineDateRange,
  summarizeInventoryTimeline,
} from "@/lib/inventory-timeline";

describe("inventory timeline helpers", () => {
  it("builds an inclusive fifteen-day calendar range", () => {
    expect(
      getInventoryTimelineDateRange(
        new Date("2026-07-30T04:00:00.000Z"),
      ),
    ).toEqual({
      startDate: "2026-07-30",
      endDate: "2026-08-13",
    });
  });

  it("sums quantity-only timeline metrics", () => {
    expect(
      summarizeInventoryTimeline([
        {
          physical: 100,
          reserved: 20,
          incoming: 40,
          safety: 10,
          netAvailableToday: 70,
        },
        {
          physical: 50,
          reserved: 5,
          incoming: 0,
          safety: 10,
          netAvailableToday: 35,
        },
      ]),
    ).toEqual({
      physical: 150,
      reserved: 25,
      incoming: 40,
      safety: 20,
      netAvailableToday: 105,
    });
  });
});
