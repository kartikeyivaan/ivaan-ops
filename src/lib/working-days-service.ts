import type { PrismaClient } from "@prisma/client";

import { assertCompanyWarehouseScopeWithClient } from "@/lib/inventory-event-service";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORKING_WEEKDAYS,
  getNextWorkingDate as resolveNextWorkingDate,
  type Weekday,
} from "@/lib/working-days";

function dateOnly(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date.");
    return value.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("Proposed date must use YYYY-MM-DD.");
  }
  return value;
}

function applyWorkingDayRows(
  weekdays: Set<Weekday>,
  rows: ReadonlyArray<{ weekday: number; isWorking: boolean }>,
) {
  for (const row of rows) {
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) {
      throw new RangeError(`Invalid configured weekday: ${row.weekday}`);
    }
    const weekday = row.weekday as Weekday;
    if (row.isWorking) weekdays.add(weekday);
    else weekdays.delete(weekday);
  }
}

export function createWorkingDaysService(client: PrismaClient = prisma) {
  return {
    async getNextWorkingDate(
      companyId: string,
      warehouseId: string,
      proposedDate: Date | string,
    ) {
      await assertCompanyWarehouseScopeWithClient(
        client,
        companyId,
        warehouseId,
      );

      const [
        companyWorkingDays,
        warehouseWorkingDays,
        companyHolidays,
        warehouseHolidays,
      ] = await Promise.all([
        client.companyWorkingDay.findMany({ where: { companyId } }),
        client.warehouseWorkingDay.findMany({ where: { warehouseId } }),
        client.companyHoliday.findMany({
          where: { companyId },
          select: { holidayDate: true },
        }),
        client.warehouseHoliday.findMany({
          where: { warehouseId },
          select: { holidayDate: true },
        }),
      ]);

      const weekdays = new Set<Weekday>(DEFAULT_WORKING_WEEKDAYS);
      applyWorkingDayRows(weekdays, companyWorkingDays);
      applyWorkingDayRows(weekdays, warehouseWorkingDays);

      const holidays = [
        ...companyHolidays.map((row) => dateOnly(row.holidayDate)),
        ...warehouseHolidays.map((row) => dateOnly(row.holidayDate)),
      ];

      return resolveNextWorkingDate(
        dateOnly(proposedDate),
        [...weekdays],
        holidays,
      );
    },
  };
}

export const { getNextWorkingDate } = createWorkingDaysService();
