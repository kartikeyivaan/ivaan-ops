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

type QuotationWhatsappInput = {
  id: string;
  quotationNo: string;
  customer: { customerName: string; mobile?: string | null };
  company: { name: string };
  salesUser: { name: string };
};

/**
 * Builds a wa.me click-to-chat URL that opens the rep's logged-in WhatsApp
 * (Web/Desktop) with a pre-filled message + link to the quotation PDF.
 *
 * Returns null when the customer has no usable mobile number.
 */
export function buildQuotationWhatsappUrl(
  quotation: QuotationWhatsappInput,
  origin: string,
): string | null {
  const number = normalizeMobileForWhatsapp(quotation.customer.mobile);
  if (!number) return null;

  const pdfUrl = `${origin.replace(/\/$/, "")}/api/quotations/${quotation.id}/pdf`;
  const message = buildQuotationWhatsappMessage({
    customerName: quotation.customer.customerName,
    companyName: quotation.company.name,
    quotationNo: quotation.quotationNo,
    pdfUrl,
    salespersonName: quotation.salesUser.name,
  });

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
