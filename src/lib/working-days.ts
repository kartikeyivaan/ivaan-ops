export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_WORKING_WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SEARCH_DAYS = 3660;

function parseDateOnly(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  return date;
}

export function addCalendarDays(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError("Calendar days must be an integer.");
  }

  const value = parseDateOnly(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getNextWorkingDate(
  proposedDate: string,
  workingWeekdays: readonly Weekday[] = DEFAULT_WORKING_WEEKDAYS,
  holidays: readonly string[] = [],
): string {
  const workingDays = new Set(workingWeekdays);
  const holidaySet = new Set(holidays);

  for (const holiday of holidaySet) {
    parseDateOnly(holiday);
  }

  if (workingDays.size === 0) {
    throw new RangeError("At least one working weekday is required.");
  }

  let candidate = proposedDate;
  for (let offset = 0; offset < MAX_SEARCH_DAYS; offset += 1) {
    const date = parseDateOnly(candidate);
    if (
      workingDays.has(date.getUTCDay() as Weekday) &&
      !holidaySet.has(candidate)
    ) {
      return candidate;
    }
    candidate = addCalendarDays(candidate, 1);
  }

  throw new RangeError("No working date found within the supported range.");
}
