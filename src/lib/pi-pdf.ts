import PDFDocument from "pdfkit";
import type { ProformaInvoiceRecord } from "@/lib/pi-service";
import {
  CELL_PAD,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  amountInWords,
  buildGstGroups,
  companyLogo,
  createDocOptions,
  drawDocumentHeader,
  drawFooter,
  drawGstSummary,
  drawParties,
  drawTable,
  isIntraState,
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

export async function generateProformaInvoicePdf(pi: ProformaInvoiceRecord): Promise<Buffer> {
  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(pi.company.code);
  const money = makeMoney(fonts.rupee);
  const ctx: DocContext = { doc, palette, fonts };

  const profile = resolveProfile(pi.company);
  const logo = companyLogo(pi.company.code);
  const pageBottom = doc.page.height - MARGIN_BOTTOM;

  const meta: Array<[string, string]> = [
    ["PI #", pi.piNo],
    ["Date", pi.piDate.toISOString().slice(0, 10)],
  ];
  if (pi.quotation) meta.push(["Quotation", pi.quotation.quotationNo]);

  const headerBottom = drawDocumentHeader(ctx, {
    logo,
    companyName: pi.company.name,
    title: "Proforma Invoice",
    profile,
    meta,
  });

  const customerLines: string[] = [];
  if (pi.customer.address) customerLines.push(pi.customer.address);
  const cityState = [pi.customer.city, pi.customer.state].filter(Boolean).join(", ");
  if (cityState) customerLines.push(cityState);
  if (pi.customer.gstNumber) customerLines.push(`GSTIN: ${pi.customer.gstNumber}`);
  const customerContact = [pi.customer.mobile, pi.customer.email].filter(Boolean).join("  |  ");
  if (customerContact) customerLines.push(customerContact);

  const execContact = pi.salesUser.officialContactNumber ?? pi.salesUser.mobile ?? null;
  const execLines = [pi.salesUser.email];
  if (execContact) execLines.push(execContact);

  const partiesBottom = drawParties(ctx, {
    top: headerBottom + 22,
    left: { label: "BILL TO", name: pi.customer.customerName, lines: customerLines },
    right: { label: "SALES EXECUTIVE", name: pi.salesUser.name, lines: execLines },
  });

  const columns: TableColumn[] = [
    { key: "index", label: "#", width: 24, align: "center" },
    { key: "item", label: "Item", width: 150, align: "left", bold: true },
    { key: "qty", label: "Qty", width: 40, align: "center" },
    { key: "rate", label: "Rate", width: 66, align: "right" },
    { key: "taxable", label: "Taxable", width: 74, align: "right" },
    { key: "gstRate", label: "GST%", width: 36, align: "center" },
    { key: "gstValue", label: "GST Amt", width: 62, align: "right" },
    { key: "total", label: "Total", width: 63, align: "right" },
  ];

  let subtotal = 0;
  let totalGst = 0;
  const gstLines: Array<{ hsn?: string | null; taxable: number; gstRate: number; gstAmount: number }> = [];
  const rows = pi.items.map((item, i) => {
    const qty = Number(item.qty);
    const gstRate = Number(item.gstRate);
    const lineTotal = Number(item.lineTotal);
    const taxable = lineTotal / (1 + gstRate / 100);
    const gstAmount = lineTotal - taxable;
    const unitRate = qty > 0 ? taxable / qty : taxable;
    subtotal += taxable;
    totalGst += gstAmount;
    gstLines.push({ hsn: item.product.hsn, taxable, gstRate, gstAmount });

    const itemLabel = item.product.hsn
      ? `${item.product.displayName}\nHSN: ${item.product.hsn}`
      : item.product.displayName;

    return {
      index: String(i + 1),
      item: itemLabel,
      qty: qty.toLocaleString("en-IN"),
      rate: money(Math.round(unitRate)),
      taxable: money(taxable),
      gstRate: `${gstRate}%`,
      gstValue: money(gstAmount),
      total: money(lineTotal),
    };
  });

  const { y: tableBottom, columnX } = drawTable(ctx, {
    top: partiesBottom + 18,
    columns,
    rows,
    pageBottom,
  });

  const grandTotal = Number(pi.totalValue);

  let y = tableBottom;
  const totalsRowHeight = 22;
  if (y + totalsRowHeight > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  }
  doc.rect(CONTENT_LEFT, y, CONTENT_WIDTH, totalsRowHeight).fill(palette.accentSoft);
  doc.font(fonts.bold).fontSize(9).fillColor(palette.ink);
  doc.text("Total", columnX.item + CELL_PAD, y + 7, { width: 200, align: "left" });
  doc.text(money(subtotal), columnX.taxable + CELL_PAD, y + 7, { width: 74 - CELL_PAD * 2, align: "right" });
  doc.text(money(totalGst), columnX.gstValue + CELL_PAD, y + 7, { width: 62 - CELL_PAD * 2, align: "right" });
  doc.text(money(grandTotal), columnX.total + CELL_PAD, y + 7, { width: 63 - CELL_PAD * 2, align: "right" });
  y += totalsRowHeight + 16;

  const intraState = isIntraState(pi.company.state, pi.customer.state);
  y = drawGstSummary(ctx, {
    top: y,
    groups: buildGstGroups(gstLines),
    intraState,
    money,
    pageBottom,
  });
  y += 16;

  const payableWidth = 240;
  const payableHeight = 36;
  const payableX = CONTENT_RIGHT - payableWidth;
  if (y + payableHeight > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  }
  doc.roundedRect(payableX, y, payableWidth, payableHeight, 4).fill(palette.primary);
  doc.font(fonts.regular).fontSize(9).fillColor("#D8D8D8").text("Total Amount Payable", payableX + 14, y + 8, {
    width: payableWidth - 28,
  });
  doc.font(fonts.bold).fontSize(16).fillColor(palette.primaryText).text(money(grandTotal), payableX + 14, y + 5, {
    width: payableWidth - 28,
    align: "right",
  });

  const wordsWidth = payableX - CONTENT_LEFT - 16;
  doc.font(fonts.bold).fontSize(8.5).fillColor(palette.faint).text("AMOUNT IN WORDS", CONTENT_LEFT, y, {
    width: wordsWidth,
  });
  doc.font(fonts.regular).fontSize(9.5).fillColor(palette.ink).text(amountInWords(grandTotal), CONTENT_LEFT, doc.y + 1, {
    width: wordsWidth,
  });

  y = Math.max(y + payableHeight, doc.y) + 22;

  const infoTop = y;
  const colWidth = (CONTENT_WIDTH - 20) / 2;
  const bankDetails = pi.company.bankDetails || profile.bankDetails;
  if (bankDetails) {
    const after = sectionTitle(ctx, "Bank Details", CONTENT_LEFT, infoTop, colWidth);
    doc.font(fonts.regular).fontSize(9).fillColor(palette.ink).text(bankDetails, CONTENT_LEFT, after + 2, {
      width: colWidth,
    });
  }

  const terms = pi.company.termsAndConditions
    ? pi.company.termsAndConditions.split("\n").filter(Boolean)
    : profile.terms;
  const termsX = CONTENT_LEFT + colWidth + 20;
  let termsY = sectionTitle(ctx, "Terms & Conditions", termsX, infoTop, colWidth) + 2;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  for (const term of terms) {
    doc.text("•", termsX, termsY, { width: 10 });
    doc.text(term, termsX + 10, termsY, { width: colWidth - 10 });
    termsY = doc.y + 2;
  }

  if (pi.notes) {
    const notesTop = Math.max(doc.y, termsY) + 12;
    const after = sectionTitle(ctx, "Notes", CONTENT_LEFT, notesTop);
    doc.font(fonts.regular).fontSize(9).fillColor(palette.ink).text(pi.notes, CONTENT_LEFT, after + 2, {
      width: CONTENT_WIDTH,
    });
  }

  const signTop = Math.max(doc.y, termsY) + 30;
  if (signTop + 40 < pageBottom) {
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(`For ${pi.company.name}`, CONTENT_RIGHT - 200, signTop, {
      width: 200,
      align: "right",
    });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text("Authorised Signatory", CONTENT_RIGHT - 200, signTop + 26, {
      width: 200,
      align: "right",
    });
  }

  const companyLine = [pi.company.name, profile.phone, profile.email].filter(Boolean).join("  ||  ");
  drawFooter(ctx, companyLine);

  return collectPdfBuffer(doc);
}
