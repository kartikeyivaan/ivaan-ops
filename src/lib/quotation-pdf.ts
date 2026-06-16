import PDFDocument from "pdfkit";
import type { QuotationRecord } from "@/lib/quotation-service";
import { formatCurrency } from "@/lib/quotations";
import { formatPricingType } from "@/lib/products";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function generateQuotationPdf(quotation: QuotationRecord): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const subtotal = quotation.items.reduce((sum, item) => {
    const gstRate = Number(item.gstRate);
    const lineTotal = Number(item.lineTotal);
    return sum + lineTotal / (1 + gstRate / 100);
  }, 0);
  const totalGst = Number(quotation.totalValue) - subtotal;

  doc.fontSize(18).text(quotation.company.name, { align: "center" });
  doc.fontSize(12).text("Quotation", { align: "center" });
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Quotation No: ${quotation.quotationNo}`);
  doc.text(`Revision: ${quotation.revisionNo}`);
  doc.text(`Date: ${quotation.quotationDate.toISOString().slice(0, 10)}`);
  doc.text(`Valid Until: ${quotation.expiryDate.toISOString().slice(0, 10)}`);
  doc.text(`Sales Executive: ${quotation.salesUser.name}`);
  doc.moveDown();

  doc.text("Bill To", { underline: true });
  doc.text(quotation.customer.customerName);
  doc.text(`GST: ${quotation.customer.gstNumber}`);
  if (quotation.customer.address) doc.text(quotation.customer.address);
  const cityState = [quotation.customer.city, quotation.customer.state].filter(Boolean).join(", ");
  if (cityState) doc.text(cityState);
  doc.moveDown();

  const tableTop = doc.y;
  doc.text("Product", 50, tableTop, { width: 180 });
  doc.text("Qty", 240, tableTop);
  doc.text("Rate", 290, tableTop);
  doc.text("GST%", 350, tableTop);
  doc.text("Total", 410, tableTop);
  doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

  let y = tableTop + 22;
  for (const item of quotation.items) {
    doc.text(item.product.displayName, 50, y, { width: 180 });
    doc.text(String(Number(item.qty)), 240, y);
    doc.text(
      `${formatCurrency(Number(item.rate))} (${formatPricingType(item.product.pricingType)})`,
      290,
      y,
      { width: 55 },
    );
    doc.text(`${Number(item.gstRate)}%`, 350, y);
    doc.text(formatCurrency(Number(item.lineTotal)), 410, y);
    y += 28;
  }

  doc.moveDown(2);
  doc.text(`Subtotal: ${formatCurrency(subtotal)}`, { align: "right" });
  doc.text(`GST: ${formatCurrency(totalGst)}`, { align: "right" });
  doc.fontSize(12).text(`Grand Total: ${formatCurrency(Number(quotation.totalValue))}`, {
    align: "right",
  });
  doc.moveDown();

  if (quotation.company.bankDetails) {
    doc.fontSize(10).text("Bank Details", { underline: true });
    doc.text(quotation.company.bankDetails);
    doc.moveDown();
  }

  if (quotation.company.termsAndConditions) {
    doc.text("Terms & Conditions", { underline: true });
    doc.text(quotation.company.termsAndConditions, { width: 500 });
    doc.moveDown();
  }

  if (quotation.notes) {
    doc.text("Notes", { underline: true });
    doc.text(quotation.notes);
  }

  doc.moveDown(2);
  doc.text("Authorised Signatory", { align: "right" });
  if (quotation.company.digitalSignatureUrl) {
    doc.fontSize(8).text(quotation.company.digitalSignatureUrl, { align: "right" });
  }

  return collectPdfBuffer(doc);
}
