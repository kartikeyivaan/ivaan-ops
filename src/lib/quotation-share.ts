import { signQuotationShareToken } from "@/lib/share-token";
import { buildQuotationWhatsappMessage, normalizeMobileForWhatsapp } from "@/lib/whatsapp";

/**
 * Public share links (and their WhatsApp wrappers) are built here on the server
 * because the token must be signed with AUTH_SECRET. Keep this module out of any
 * client component; expose the finished URL as a prop / API field instead.
 */

const SHARE_LINK_TTL_DAYS = 5;

type QuotationShareInput = {
  id: string;
  quotationNo: string;
  customer: { customerName: string; mobile?: string | null };
  company: { name: string };
  salesUser: { name: string };
};

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

/**
 * Tokenized, login-free URL to the quotation PDF. Valid for 5 days.
 */
export function buildQuotationPublicPdfUrl(quotationId: string): string {
  const token = signQuotationShareToken(quotationId, SHARE_LINK_TTL_DAYS);
  return `${appBaseUrl()}/api/share/quotation?token=${encodeURIComponent(token)}`;
}

/**
 * wa.me click-to-chat URL with the customer message + public PDF link.
 * Returns null when the customer has no usable mobile number.
 */
export function buildQuotationWhatsappUrl(quotation: QuotationShareInput): string | null {
  const number = normalizeMobileForWhatsapp(quotation.customer.mobile);
  if (!number) return null;

  const pdfUrl = buildQuotationPublicPdfUrl(quotation.id);
  const message = buildQuotationWhatsappMessage({
    customerName: quotation.customer.customerName,
    companyName: quotation.company.name,
    quotationNo: quotation.quotationNo,
    pdfUrl,
    salespersonName: quotation.salesUser.name,
  });

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
