import { PROJECT_PROPOSAL_VALIDITY_DAYS } from "@/lib/project-proposal-pricing";
import { QUOTATION_VALIDITY_DAYS } from "@/lib/quotations";

export const PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER =
  "[Proposal PDF link will be shared separately]";

export function formatWhatsappIndianMoney(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

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

/**
 * Builds the customer-facing WhatsApp message body for a proforma invoice.
 */
export function buildProformaInvoiceWhatsappMessage(input: {
  customerName: string;
  companyName: string;
  piNo: string;
  pdfUrl: string;
  salespersonName: string;
}): string {
  return (
    `Hi ${input.customerName}, thank you for choosing ${input.companyName}. ` +
    `Please find your proforma invoice ${input.piNo} here: ${input.pdfUrl}. ` +
    `— ${input.salespersonName}`
  );
}

/**
 * Builds the customer-facing WhatsApp message body for a delivery challan.
 */
export function buildDispatchWhatsappMessage(input: {
  customerName: string;
  companyName: string;
  dcNo: string;
  piNo: string;
  pdfUrl: string;
}): string {
  return (
    `Hi ${input.customerName}, your delivery from ${input.companyName} is complete. ` +
    `Please find Delivery Challan ${input.dcNo} (PI ${input.piNo}) here: ${input.pdfUrl}.`
  );
}

export function buildProjectProposalWhatsappMessage(input: {
  customerName: string;
  proposalNo: string;
  finalAmount: number;
  subsidyAmount: number;
  effectivePrice: number;
  pdfUrl?: string | null;
  validityDays?: number;
}): string {
  const validity = input.validityDays ?? PROJECT_PROPOSAL_VALIDITY_DAYS;
  const pdfLine = input.pdfUrl?.trim()
    ? `Proposal PDF: ${input.pdfUrl}`
    : `Proposal PDF: ${PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER}`;

  return [
    `Dear ${input.customerName},`,
    "",
    "Thank you for choosing Ivaan Solar Energy.",
    "",
    "Please find your Solar Project Proposal.",
    "",
    `Proposal No: ${input.proposalNo}`,
    `Amount: ₹${formatWhatsappIndianMoney(input.finalAmount)}`,
    `Estimated Subsidy: ₹${formatWhatsappIndianMoney(input.subsidyAmount)}`,
    `Effective Customer Investment: ₹${formatWhatsappIndianMoney(input.effectivePrice)}`,
    `Validity: ${validity} Days`,
    "",
    pdfLine,
    "",
    "Please contact us for any queries.",
    "",
    "Regards,",
    "Ivaan Solar Energy",
  ].join("\n");
}
