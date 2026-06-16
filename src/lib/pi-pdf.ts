import PDFDocument from "pdfkit";
import type { ProformaInvoiceRecord } from "@/lib/pi-service";
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

export async function generateProformaInvoicePdf(
  pi: ProformaInvoiceRecord,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const subtotal = pi.items.reduce((sum, item) => {
    const gstRate = Number(item.gstRate);
    const lineTotal = Number(item.lineTotal);
    return sum + lineTotal / (1 + gstRate / 100);
  }, 0);
  const totalGst = Number(pi.totalValue) - subtotal;

  doc.fontSize(18).text(pi.company.name, { align: "center" });
  doc.fontSize(12).text("Proforma Invoice", { align: "center" });
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`PI No: ${pi.piNo}`);
  doc.text(`Date: ${pi.piDate.toISOString().slice(0, 10)}`);
  doc.text(`Sales Executive: ${pi.salesUser.name}`);
  if (pi.quotation) doc.text(`Quotation: ${pi.quotation.quotationNo}`);
  doc.moveDown();

  doc.text("Bill To", { underline: true });
  doc.text(pi.customer.customerName);
  doc.text(`GST: ${pi.customer.gstNumber}`);
  if (pi.customer.address) doc.text(pi.customer.address);
  const cityState = [pi.customer.city, pi.customer.state].filter(Boolean).join(", ");
  if (cityState) doc.text(cityState);
  doc.moveDown();

  const tableTop = doc.y;
  doc.text("Product", 50, tableTop, { width: 180 });
  doc.text("Qty", 240, tableTop);
  doc.text("Rate", 290, tableTop);
  doc.text("GST%", 350, tableTop);
  doc.text("Total", 410, tableTop);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  for (const item of pi.items) {
    const y = doc.y;
    doc.text(item.product.displayName, 50, y, { width: 180 });
    doc.text(
      `${Number(item.qty)} (${formatPricingType(item.product.pricingType)})`,
      240,
      y,
    );
    doc.text(String(Number(item.rate)), 290, y);
    doc.text(`${Number(item.gstRate)}%`, 350, y);
    doc.text(formatCurrency(Number(item.lineTotal)), 410, y);
    doc.moveDown();
  }

  doc.moveDown();
  doc.text(`Subtotal: ${formatCurrency(subtotal)}`, { align: "right" });
  doc.text(`GST: ${formatCurrency(totalGst)}`, { align: "right" });
  doc.fontSize(12).text(`Grand Total: ${formatCurrency(Number(pi.totalValue))}`, {
    align: "right",
  });
  doc.fontSize(10);

  if (pi.company.bankDetails) {
    doc.moveDown();
    doc.text("Bank Details", { underline: true });
    doc.text(pi.company.bankDetails);
  }

  if (pi.company.termsAndConditions) {
    doc.moveDown();
    doc.text("Terms & Conditions", { underline: true });
    doc.text(pi.company.termsAndConditions);
  }

  return collectPdfBuffer(doc);
}
