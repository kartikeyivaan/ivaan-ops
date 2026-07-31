import { signProformaInvoiceShareToken } from "@/lib/share-token";
import {
  buildProformaInvoiceWhatsappMessage,
  normalizeMobileForWhatsapp,
} from "@/lib/whatsapp";

/**
 * Public share links (and their WhatsApp wrappers) are built here on the server
 * because the token must be signed with AUTH_SECRET. Keep this module out of any
 * client component; expose the finished URL as a prop / API field instead.
 */

const SHARE_LINK_TTL_DAYS = 5;

type ProformaInvoiceShareInput = {
  id: string;
  piNo: string;
  status: string;
  customer: { customerName: string; mobile?: string | null };
  company: { name: string };
  salesUser: { name: string };
};

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

export function canShareProformaInvoice(status: string): boolean {
  return status !== "DRAFT";
}

/** Tokenized, login-free URL to the PI PDF. Valid for 5 days. */
export function buildProformaInvoicePublicPdfUrl(piId: string): string {
  const token = signProformaInvoiceShareToken(piId, SHARE_LINK_TTL_DAYS);
  return `${appBaseUrl()}/api/share/proforma-invoice?token=${encodeURIComponent(token)}`;
}

/**
 * wa.me click-to-chat URL with the customer message + public PDF link.
 * Returns null when the PI is still a draft or the customer has no usable mobile.
 */
export function buildProformaInvoiceWhatsappUrl(
  pi: ProformaInvoiceShareInput,
): string | null {
  if (!canShareProformaInvoice(pi.status)) return null;

  const number = normalizeMobileForWhatsapp(pi.customer.mobile);
  if (!number) return null;

  const pdfUrl = buildProformaInvoicePublicPdfUrl(pi.id);
  const message = buildProformaInvoiceWhatsappMessage({
    customerName: pi.customer.customerName,
    companyName: pi.company.name,
    piNo: pi.piNo,
    pdfUrl,
    salespersonName: pi.salesUser.name,
  });

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
