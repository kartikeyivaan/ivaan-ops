import PDFDocument from "pdfkit";
import type { DispatchRecord } from "@/lib/dispatch-service";
import { decimalToNumber } from "@/lib/inventory";
import { formatCurrency } from "@/lib/quotations";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function generateDispatchPdf(dispatch: DispatchRecord): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  doc.fontSize(18).text(dispatch.company.name, { align: "center" });
  doc.fontSize(12).text("Delivery Challan", { align: "center" });
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`DC No: ${dispatch.dcNo}`);
  doc.text(`Date: ${dispatch.dispatchDate.toISOString().slice(0, 10)}`);
  doc.text(`PI No: ${dispatch.proformaInvoice.piNo}`);
  doc.text(`Warehouse: ${dispatch.warehouse.name}`);
  if (dispatch.vehicleNo) doc.text(`Vehicle: ${dispatch.vehicleNo}`);
  if (dispatch.driverName) doc.text(`Driver: ${dispatch.driverName}`);
  doc.moveDown();

  doc.text("Deliver To", { underline: true });
  doc.text(dispatch.customer.customerName);
  doc.text(`GST: ${dispatch.customer.gstNumber}`);
  if (dispatch.customer.address) doc.text(dispatch.customer.address);
  const cityState = [dispatch.customer.city, dispatch.customer.state].filter(Boolean).join(", ");
  if (cityState) doc.text(cityState);
  doc.moveDown();

  const tableTop = doc.y;
  doc.text("Product", 50, tableTop, { width: 180 });
  doc.text("Qty", 240, tableTop);
  doc.text("HSN", 290, tableTop);
  doc.text("Serials", 340, tableTop);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  let totalValue = 0;
  for (const line of dispatch.lines) {
    const y = doc.y;
    const qty = decimalToNumber(line.qty);
    const rate = decimalToNumber(line.proformaInvoiceItem.rate);
    totalValue += qty * rate;

    doc.text(line.product.displayName, 50, y, { width: 180 });
    doc.text(String(qty), 240, y);
    doc.text(line.product.hsn ?? "—", 290, y);
    doc.text(
      line.serials.map((entry) => entry.serial.serialNumber).join(", ") || "—",
      340,
      y,
      { width: 200 },
    );
    doc.moveDown();
  }

  doc.moveDown();
  doc.text(`Dispatch Value: ${formatCurrency(totalValue)}`, { align: "right" });

  if (dispatch.notes) {
    doc.moveDown();
    doc.text("Notes", { underline: true });
    doc.text(dispatch.notes);
  }

  if (dispatch.company.termsAndConditions) {
    doc.moveDown();
    doc.text("Terms", { underline: true });
    doc.text(dispatch.company.termsAndConditions);
  }

  return collectPdfBuffer(doc);
}
