import { createHash } from "node:crypto";
import type { QuotationRecord } from "@/lib/quotation-service";
import type { ProformaInvoiceRecord } from "@/lib/pi-service";
import type { DispatchRecord } from "@/lib/dispatch-service";
import type { ProjectDispatchRecord } from "@/lib/project-dispatch-service";
import type { ProjectProposalPdfRecord } from "@/lib/project-proposal-pdf";
import { decimalToNumber } from "@/lib/inventory";
import { pdfContentVersion } from "@/lib/pdf-cache";

function sha16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sortedJoin(parts: string[]): string {
  return [...parts].sort().join(";");
}

export function quotationPdfContentVersion(quotation: QuotationRecord): string {
  const lineParts = quotation.items.map(
    (item) =>
      `${item.productId}:${decimalToNumber(item.qty)}:${decimalToNumber(item.rate)}:${decimalToNumber(item.lineTotal)}:${item.approvalStatus}`,
  );
  const customer = quotation.customer;
  return pdfContentVersion([
    quotation.quotationNo,
    quotation.revisionNo,
    quotation.status,
    quotation.updatedAt.toISOString(),
    quotation.totalValue.toString(),
    quotation.quotationDate.toISOString().slice(0, 10),
    quotation.expiryDate.toISOString().slice(0, 10),
    quotation.notes ?? "",
    quotation.deliveryTermMode,
    quotation.bookingAllowed ? "1" : "0",
    quotation.requiredPaymentPercent?.toString() ?? "",
    quotation.dispatchMinDays ?? "",
    quotation.dispatchMaxDays ?? "",
    quotation.deliveryTermNoteSnapshot ?? "",
    customer.id,
    customer.customerName,
    customer.gstNumber ?? "",
    customer.address ?? "",
    customer.city ?? "",
    customer.state ?? "",
    customer.mobile ?? "",
    customer.email ?? "",
    quotation.salesUser.id,
    sortedJoin(lineParts),
  ]);
}

export function proformaInvoicePdfContentVersion(pi: ProformaInvoiceRecord): string {
  const lineParts = pi.items.map(
    (item) =>
      `${item.productId}:${decimalToNumber(item.qty)}:${decimalToNumber(item.rate)}:${decimalToNumber(item.lineTotal)}:${decimalToNumber(item.gstRate)}`,
  );
  const customer = pi.customer;
  return pdfContentVersion([
    pi.piNo,
    pi.status,
    pi.updatedAt.toISOString(),
    pi.totalValue.toString(),
    pi.piDate.toISOString().slice(0, 10),
    customer.id,
    customer.customerName,
    customer.gstNumber ?? "",
    customer.address ?? "",
    customer.city ?? "",
    customer.state ?? "",
    customer.mobile ?? "",
    sortedJoin(lineParts),
  ]);
}

export function dispatchPdfContentVersion(dispatch: DispatchRecord): string {
  const lineParts = dispatch.lines.map((line) => {
    const serials = line.serials
      .map((entry) => entry.serial.serialNumber)
      .sort()
      .join(",");
    return `${line.productId}:${decimalToNumber(line.qty)}:${serials}`;
  });
  const customer = dispatch.customer;
  return pdfContentVersion([
    dispatch.dcNo,
    dispatch.status,
    dispatch.updatedAt.toISOString(),
    dispatch.dispatchDate.toISOString().slice(0, 10),
    dispatch.physicalChallanNumber ?? "",
    dispatch.vehicleNo ?? "",
    dispatch.driverName ?? "",
    dispatch.receiverName ?? "",
    dispatch.receiverMobile ?? "",
    dispatch.notes ?? "",
    customer.id,
    customer.customerName,
    customer.address ?? "",
    customer.gstNumber ?? "",
    dispatch.proformaInvoice.piNo,
    sortedJoin(lineParts),
  ]);
}

export function projectDispatchPdfContentVersion(dispatch: ProjectDispatchRecord): string {
  const lineParts = dispatch.lines.map((line) => {
    const serials = line.serials
      .map((entry) => entry.serial.serialNumber)
      .sort()
      .join(",");
    return `${line.productId}:${decimalToNumber(line.qty)}:${serials}`;
  });
  const project = dispatch.project;
  return pdfContentVersion([
    dispatch.dispatchNo,
    dispatch.status,
    dispatch.updatedAt.toISOString(),
    dispatch.dispatchedAt?.toISOString() ?? "",
    dispatch.vehicleNo ?? "",
    dispatch.receiverName ?? "",
    dispatch.receiverMobile ?? "",
    dispatch.remarks ?? "",
    project.id,
    project.customerName,
    project.siteAddress ?? "",
    sortedJoin(lineParts),
  ]);
}

export function projectProposalPdfContentVersion(proposal: ProjectProposalPdfRecord): string {
  const revision =
    proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1];
  return pdfContentVersion([
    proposal.proposalNo,
    proposal.status,
    proposal.updatedAt.toISOString(),
    proposal.currentRevisionNo,
    revision?.updatedAt.toISOString() ?? "",
    revision?.customerName ?? "",
    revision?.finalAmount?.toString() ?? "",
    revision?.packageId ?? "",
    revision?.moduleProductId ?? "",
    revision?.inverterUpgradeId ?? "",
  ]);
}

export type OfficialLetterPrintFingerprintSource = {
  updatedAt: Date;
  status: string;
  letterDate: Date;
  content: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImageData: string | null;
  stampImageData: string | null;
  stampEnabled: boolean;
  printSignatureEnabled: boolean;
  printContentTopOffsetMm: number;
};

export function officialLetterPrintContentVersion(
  letter: OfficialLetterPrintFingerprintSource,
): string {
  return pdfContentVersion([
    letter.status,
    letter.updatedAt.toISOString(),
    letter.letterDate.toISOString().slice(0, 10),
    letter.signatoryName,
    letter.signatoryDesignation,
    letter.stampEnabled ? "1" : "0",
    letter.printSignatureEnabled ? "1" : "0",
    letter.printContentTopOffsetMm,
    sha16(letter.content),
    letter.signatureImageData ? sha16(letter.signatureImageData) : "",
    letter.stampImageData ? sha16(letter.stampImageData) : "",
  ]);
}
