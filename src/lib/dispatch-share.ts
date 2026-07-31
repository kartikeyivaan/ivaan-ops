import { signDispatchShareToken } from "@/lib/share-token";
import { buildDispatchWhatsappMessage, normalizeMobileForWhatsapp } from "@/lib/whatsapp";

/**
 * Public share links (and their WhatsApp wrappers) are built here on the server
 * because the token must be signed with AUTH_SECRET. Keep this module out of any
 * client component; expose the finished URL as a prop / API field instead.
 */

const SHARE_LINK_TTL_DAYS = 5;

type DispatchShareInput = {
  id: string;
  dcNo: string;
  status: string;
  customer: { customerName: string; mobile?: string | null };
  company: { name: string };
  proformaInvoice: { piNo: string };
};

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

export function canShareDispatchChallan(status: string): boolean {
  return status === "DISPATCHED";
}

/** Tokenized, login-free URL to the delivery challan PDF. Valid for 5 days. */
export function buildDispatchPublicPdfUrl(dispatchId: string): string {
  const token = signDispatchShareToken(dispatchId, SHARE_LINK_TTL_DAYS);
  return `${appBaseUrl()}/api/share/dispatch?token=${encodeURIComponent(token)}`;
}

/**
 * wa.me click-to-chat URL with the customer message + public PDF link.
 * Returns null unless the dispatch is DISPATCHED and the customer has a usable mobile.
 */
export function buildDispatchWhatsappUrl(dispatch: DispatchShareInput): string | null {
  if (!canShareDispatchChallan(dispatch.status)) return null;

  const number = normalizeMobileForWhatsapp(dispatch.customer.mobile);
  if (!number) return null;

  const pdfUrl = buildDispatchPublicPdfUrl(dispatch.id);
  const message = buildDispatchWhatsappMessage({
    customerName: dispatch.customer.customerName,
    companyName: dispatch.company.name,
    dcNo: dispatch.dcNo,
    piNo: dispatch.proformaInvoice.piNo,
    pdfUrl,
  });

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
