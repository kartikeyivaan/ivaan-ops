import PDFDocument from "pdfkit";
import type { DispatchRecord } from "@/lib/dispatch-service";
import { decimalToNumber } from "@/lib/inventory";
import {
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  companyLogo,
  createDocOptions,
  drawDocumentHeader,
  drawFooter,
  drawParties,
  drawTable,
  makeMoney,
  resolvePalette,
  resolveProfile,
  sectionTitle,
  setupFonts,
  type DocContext,
  type TableColumn,
} from "@/lib/pdf-theme";

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
  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(dispatch.company.code);
  const money = makeMoney(fonts.rupee);
  const ctx: DocContext = { doc, palette, fonts };

  const profile = resolveProfile(dispatch.company);
  const logo = companyLogo(dispatch.company.code);
  const pageBottom = doc.page.height - MARGIN_BOTTOM;

  const meta: Array<[string, string]> = [
    ["Challan #", dispatch.dcNo],
    ["Date", dispatch.dispatchDate.toISOString().slice(0, 10)],
    ["PI #", dispatch.proformaInvoice.piNo],
  ];

  const headerBottom = drawDocumentHeader(ctx, {
    logo,
    companyName: dispatch.company.name,
    title: "Delivery Challan",
    profile,
    meta,
  });

  const customerLines: string[] = [];
  if (dispatch.customer.address) customerLines.push(dispatch.customer.address);
  const cityState = [dispatch.customer.city, dispatch.customer.state].filter(Boolean).join(", ");
  if (cityState) customerLines.push(cityState);
  if (dispatch.customer.gstNumber) customerLines.push(`GSTIN: ${dispatch.customer.gstNumber}`);

  const dispatchLines = [dispatch.warehouse.name];
  if (dispatch.vehicleNo) dispatchLines.push(`Vehicle: ${dispatch.vehicleNo}`);
  if (dispatch.driverName) dispatchLines.push(`Driver: ${dispatch.driverName}`);

  const partiesBottom = drawParties(ctx, {
    top: headerBottom + 22,
    left: { label: "DELIVER TO", name: dispatch.customer.customerName, lines: customerLines },
    right: { label: "DISPATCHED FROM", name: dispatch.warehouse.name, lines: dispatchLines.slice(1) },
  });

  const columns: TableColumn[] = [
    { key: "index", label: "#", width: 24, align: "center" },
    { key: "item", label: "Item", width: 190, align: "left", bold: true },
    { key: "qty", label: "Qty", width: 45, align: "center" },
    { key: "serials", label: "Serial Numbers", width: 256, align: "left" },
  ];

  let totalValue = 0;
  const rows = dispatch.lines.map((line, i) => {
    const qty = decimalToNumber(line.qty);
    const rate = decimalToNumber(line.proformaInvoiceItem.rate);
    totalValue += qty * rate;

    const itemLabel = line.product.hsn
      ? `${line.product.displayName}\nHSN: ${line.product.hsn}`
      : line.product.displayName;
    const serials = line.serials.map((entry) => entry.serial.serialNumber).join(", ") || "—";

    return {
      index: String(i + 1),
      item: itemLabel,
      qty: qty.toLocaleString("en-IN"),
      serials,
    };
  });

  const { y: tableBottom } = drawTable(ctx, {
    top: partiesBottom + 18,
    columns,
    rows,
    pageBottom,
  });

  let y = tableBottom + 12;

  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text("Value (for transit reference only)", CONTENT_LEFT, y, {
    width: 300,
  });
  doc.font(fonts.bold).fontSize(10).fillColor(palette.ink).text(money(totalValue), CONTENT_RIGHT - 200, y, {
    width: 200,
    align: "right",
  });
  y = doc.y + 16;

  if (dispatch.notes) {
    const after = sectionTitle(ctx, "Notes", CONTENT_LEFT, y);
    doc.font(fonts.regular).fontSize(9).fillColor(palette.ink).text(dispatch.notes, CONTENT_LEFT, after + 2, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 12;
  }

  if (dispatch.company.termsAndConditions) {
    const after = sectionTitle(ctx, "Terms", CONTENT_LEFT, y, CONTENT_WIDTH);
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(dispatch.company.termsAndConditions, CONTENT_LEFT, after + 2, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 12;
  }

  const signTop = y + 24;
  if (signTop + 40 < pageBottom) {
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text("Received in good condition", CONTENT_LEFT, signTop, {
      width: 220,
    });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text("Receiver's Signature", CONTENT_LEFT, signTop + 26, {
      width: 220,
    });
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(`For ${dispatch.company.name}`, CONTENT_RIGHT - 200, signTop, {
      width: 200,
      align: "right",
    });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text("Authorised Signatory", CONTENT_RIGHT - 200, signTop + 26, {
      width: 200,
      align: "right",
    });
  }

  const companyLine = [dispatch.company.name, profile.phone, profile.email].filter(Boolean).join("  ||  ");
  drawFooter(ctx, companyLine);

  return collectPdfBuffer(doc);
}
