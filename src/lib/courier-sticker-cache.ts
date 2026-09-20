import { createHash } from "crypto";
import type { CourierStickerCustomer } from "@/lib/courier-sticker-pdf";
import { pdfContentVersion } from "@/lib/pdf-cache";

export type CourierStickerCacheInput = {
  updatedAt: Date | string;
  dcNo: string;
  invoiceNumber?: string | null;
  boxCount: number;
  customer: CourierStickerCustomer;
};

function field(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Stable fingerprint of the fields printed on a courier sticker. */
export function courierStickerPrintFingerprint(
  boxCount: number,
  customer: CourierStickerCustomer,
  invoiceNumber?: string | null,
): string {
  return [
    boxCount,
    field(invoiceNumber),
    field(customer.customerName),
    field(customer.contactPersonName),
    field(customer.address),
    field(customer.city),
    field(customer.state),
    field(customer.pinCode),
    field(customer.mobile),
  ].join("|");
}

export function courierStickerPdfVariant(
  boxCount: number,
  customer: CourierStickerCustomer,
  invoiceNumber?: string | null,
): string {
  const hash = createHash("sha256")
    .update(courierStickerPrintFingerprint(boxCount, customer, invoiceNumber))
    .digest("hex")
    .slice(0, 16);
  return `courier-sticker:${boxCount}:${hash}`;
}

export function courierStickerContentVersion(input: CourierStickerCacheInput): string {
  const updatedAt =
    input.updatedAt instanceof Date ? input.updatedAt.toISOString() : String(input.updatedAt);
  return pdfContentVersion([
    updatedAt,
    input.dcNo,
    field(input.invoiceNumber),
    input.boxCount,
    field(input.customer.customerName),
    field(input.customer.contactPersonName),
    field(input.customer.address),
    field(input.customer.city),
    field(input.customer.state),
    field(input.customer.pinCode),
    field(input.customer.mobile),
  ]);
}
