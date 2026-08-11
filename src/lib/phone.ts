/**
 * Indian mobile helpers.
 *
 * Contact apps often paste "+91 98765 43210" / "91 9876543210" / "09876543210".
 * We always store and validate the local 10-digit subscriber number.
 */

/** Strip formatting; if a country/trunk prefix is present, keep the trailing 10 digits. */
export function normalizeMobileNumber(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

/** Accept 10-digit Indian mobile numbers (leading 6-9). */
export function isValidIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobileNumber(value));
}
