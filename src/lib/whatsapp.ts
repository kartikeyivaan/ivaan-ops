import { QUOTATION_VALIDITY_DAYS } from "@/lib/quotations";

/**
 * Normalizes a stored mobile number into a bare, country-coded digit string
 * suitable for a wa.me / click-to-chat link (no "+", spaces or separators).
 *
 * Assumes Indian numbers by default: a bare 10-digit number gets the 91 prefix.
 */
export function normalizeMobileForWhatsapp(
  raw: string | null | undefined,
  defaultCountryCode = "91",
): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  // Drop trunk/leading zeros (e.g. 0 98765 43210).
  digits = digits.replace(/^0+/, "");
  if (!digits) return null;

  // Bare local number -> prepend the default country code.
  if (digits.length === 10) {
    digits = `${defaultCountryCode}${digits}`;
  }

  // Sanity bounds for an international MSISDN (country code + subscriber number).
  if (digits.length < 11 || digits.length > 15) return null;

  return digits;
}

/**
 * Builds the customer-facing WhatsApp message body for a quotation.
 */
export function buildQuotationWhatsappMessage(input: {
  customerName: string;
  companyName: string;
  quotationNo: string;
  pdfUrl: string;
  salespersonName: string;
  validityDays?: number;
}): string {
  const validity = input.validityDays ?? QUOTATION_VALIDITY_DAYS;
  return (
    `Hi ${input.customerName}, thank you for your interest in ${input.companyName} products. ` +
    `Please find your quotation ${input.quotationNo} here: ${input.pdfUrl}. ` +
    `Valid for ${validity} days. — ${input.salespersonName}`
  );
}
