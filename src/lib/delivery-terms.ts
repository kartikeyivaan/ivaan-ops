import {
  addCalendarDays,
  DEFAULT_WORKING_WEEKDAYS,
  getNextWorkingDate,
  type Weekday,
} from "@/lib/working-days";

export const DELIVERY_TERM_MODES = [
  "ADVANCE_BOOKING",
  "READY_STOCK",
  "SUBJECT_TO_AVAILABILITY",
] as const;

export type DeliveryTermMode = (typeof DELIVERY_TERM_MODES)[number];

export type DeliveryTerms = {
  mode: DeliveryTermMode;
  requiredPaymentPercent?: number | null;
  dispatchMinDays?: number | null;
  dispatchMaxDays?: number | null;
};

export type DispatchDateRange = {
  earliestDispatchDate: string;
  latestDispatchDate: string;
};

export const READY_STOCK_NOTE =
  "100% payment is required for booking. The item is offered from ready stock and remains subject to availability until booking confirmation.";
export const SUBJECT_TO_AVAILABILITY_NOTE =
  "Dispatch is subject to material availability.";

export function bookingAllowed(mode: DeliveryTermMode): boolean {
  return mode !== "SUBJECT_TO_AVAILABILITY";
}

export function getDeliveryTermNote(terms: DeliveryTerms): string {
  if (terms.mode === "READY_STOCK") {
    return READY_STOCK_NOTE;
  }

  if (terms.mode === "SUBJECT_TO_AVAILABILITY") {
    return SUBJECT_TO_AVAILABILITY_NOTE;
  }

  const payment = terms.requiredPaymentPercent;
  const minDays = terms.dispatchMinDays;
  const maxDays = terms.dispatchMaxDays;
  return `${payment}% advance payment is required for booking. Delivery is expected within ${minDays}–${maxDays} days from booking confirmation.`;
}

export function validateDeliveryTerms(terms: DeliveryTerms): string[] {
  const errors: string[] = [];

  if (terms.mode === "ADVANCE_BOOKING") {
    if (
      terms.requiredPaymentPercent == null ||
      !Number.isFinite(terms.requiredPaymentPercent) ||
      terms.requiredPaymentPercent <= 0 ||
      terms.requiredPaymentPercent > 100
    ) {
      errors.push("Required payment percentage must be greater than 0 and at most 100.");
    }

    if (
      terms.dispatchMinDays == null ||
      !Number.isInteger(terms.dispatchMinDays) ||
      terms.dispatchMinDays < 0
    ) {
      errors.push("Dispatch minimum days must be a non-negative integer.");
    }

    if (
      terms.dispatchMaxDays == null ||
      !Number.isInteger(terms.dispatchMaxDays) ||
      terms.dispatchMaxDays < 0
    ) {
      errors.push("Dispatch maximum days must be a non-negative integer.");
    }

    if (
      terms.dispatchMinDays != null &&
      terms.dispatchMaxDays != null &&
      terms.dispatchMinDays > terms.dispatchMaxDays
    ) {
      errors.push("Dispatch minimum days cannot exceed maximum days.");
    }
  }

  if (
    terms.mode === "READY_STOCK" &&
    terms.requiredPaymentPercent != null &&
    terms.requiredPaymentPercent !== 100
  ) {
    errors.push("Ready stock requires 100% payment.");
  }

  return errors;
}

export function computeDispatchDateRange(
  bookingDate: string,
  terms: DeliveryTerms,
  workingWeekdays: readonly Weekday[] = DEFAULT_WORKING_WEEKDAYS,
  holidays: readonly string[] = [],
): DispatchDateRange | null {
  const errors = validateDeliveryTerms(terms);
  if (errors.length > 0) {
    throw new RangeError(errors.join(" "));
  }

  if (!bookingAllowed(terms.mode)) {
    return null;
  }

  const minDays =
    terms.mode === "READY_STOCK" ? 0 : (terms.dispatchMinDays as number);
  const maxDays =
    terms.mode === "READY_STOCK" ? 0 : (terms.dispatchMaxDays as number);

  return {
    earliestDispatchDate: getNextWorkingDate(
      addCalendarDays(bookingDate, minDays),
      workingWeekdays,
      holidays,
    ),
    latestDispatchDate: getNextWorkingDate(
      addCalendarDays(bookingDate, maxDays),
      workingWeekdays,
      holidays,
    ),
  };
}
