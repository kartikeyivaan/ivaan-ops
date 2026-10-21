import {
  buildServiceRequestWhatsappMessage,
  normalizeMobileForWhatsapp,
} from "@/lib/whatsapp";

export type ServiceExecutiveContact = {
  name: string;
  mobile?: string | null;
  officialContactNumber?: string | null;
};

export type ServiceRequestWhatsappInput = {
  customerName: string;
  mobileNumber?: string | null;
  serviceRequestNumber: string;
  assignedTo?: ServiceExecutiveContact | null;
};

/**
 * Prefer official contact, then personal/mobile — same order used on sales PDFs.
 */
export function resolveServiceExecutiveMobile(
  executive: ServiceExecutiveContact | null | undefined,
): string | null {
  if (!executive) return null;
  const official = executive.officialContactNumber?.trim();
  if (official) return official;
  const mobile = executive.mobile?.trim();
  return mobile || null;
}

/**
 * wa.me click-to-chat URL notifying the customer that their service request was
 * raised and who will visit. Returns null when customer or executive contact
 * details are missing.
 */
export function buildServiceRequestWhatsappUrl(
  request: ServiceRequestWhatsappInput,
): string | null {
  const customerNumber = normalizeMobileForWhatsapp(request.mobileNumber);
  const executiveMobile = resolveServiceExecutiveMobile(request.assignedTo);
  if (!customerNumber || !request.assignedTo?.name || !executiveMobile) {
    return null;
  }

  const message = buildServiceRequestWhatsappMessage({
    customerName: request.customerName,
    serviceRequestNumber: request.serviceRequestNumber,
    executiveName: request.assignedTo.name,
    executiveMobile,
  });

  return `https://wa.me/${customerNumber}?text=${encodeURIComponent(message)}`;
}
