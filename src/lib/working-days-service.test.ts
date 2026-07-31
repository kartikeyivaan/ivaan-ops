import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createWorkingDaysService } from "@/lib/working-days-service";

function calendarClient(overrides?: {
  companyDays?: Array<{ weekday: number; isWorking: boolean }>;
  warehouseDays?: Array<{ weekday: number; isWorking: boolean }>;
  companyHolidays?: Date[];
  warehouseHolidays?: Date[];
}) {
  return {
    warehouse: {
      findFirst: vi.fn(async () => ({ id: "warehouse-1" })),
    },
    companyWorkingDay: {
      findMany: vi.fn(async () => overrides?.companyDays ?? []),
    },
    warehouseWorkingDay: {
      findMany: vi.fn(async () => overrides?.warehouseDays ?? []),
    },
    companyHoliday: {
      findMany: vi.fn(async () =>
        (overrides?.companyHolidays ?? []).map((holidayDate) => ({
          holidayDate,
        })),
      ),
    },
    warehouseHoliday: {
      findMany: vi.fn(async () =>
        (overrides?.warehouseHolidays ?? []).map((holidayDate) => ({
          holidayDate,
        })),
      ),
    },
  } as unknown as PrismaClient;
}

describe("working days service", () => {
  it("defaults to Sunday off when no calendar rows exist", async () => {
    const service = createWorkingDaysService(calendarClient());
    await expect(
      service.getNextWorkingDate(
        "company-1",
        "warehouse-1",
        "2026-08-02",
      ),
    ).resolves.toBe("2026-08-03");
  });

  it("applies warehouse weekday overrides and both holiday levels", async () => {
    const client = calendarClient({
      companyHolidays: [new Date("2026-08-03T00:00:00.000Z")],
      warehouseHolidays: [new Date("2026-08-04T00:00:00.000Z")],
      warehouseDays: [{ weekday: 1, isWorking: false }],
    });

    await expect(
      createWorkingDaysService(client).getNextWorkingDate(
        "company-1",
        "warehouse-1",
        "2026-08-02",
      ),
    ).resolves.toBe("2026-08-05");
  });
});
