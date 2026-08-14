import PDFDocument from "pdfkit";
import type { ProjectDispatchRecord } from "@/lib/project-dispatch-service";
import { decimalToNumber } from "@/lib/inventory";
import { formatDocumentDate } from "@/lib/utils";
import {
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  companyLogo,
  createDocOptions,
  drawDocumentHeader,
  DISPATCH_TERMS,
  drawFooter,
  drawParties,
  resolvePalette,
  resolveProfile,
  sectionTitle,
  setupFonts,
  type DocContext,
} from "@/lib/pdf-theme";

function drawProjectDispatchLines(
  ctx: DocContext,
  opts: {
    top: number;
    pageBottom: number;
    lines: ProjectDispatchRecord["lines"];
  },
): number {
  const { doc, palette, fonts } = ctx;
  const qtyWidth = 90;
  const nameWidth = CONTENT_WIDTH - qtyWidth - 8;
  const headerHeight = 22;

  const drawHeader = (top: number): number => {
    doc.rect(CONTENT_LEFT, top, CONTENT_WIDTH, headerHeight).fill(palette.primary);
    doc.font(fonts.bold).fontSize(8.5).fillColor(palette.primaryText);
    doc.text("Product", CONTENT_LEFT + 5, top + 7, { width: nameWidth });
    doc.text("Qty", CONTENT_RIGHT - qtyWidth - 5, top + 7, {
      width: qtyWidth,
      align: "right",
    });
    return top + headerHeight;
  };

  let y = drawHeader(opts.top);

  for (const [index, line] of opts.lines.entries()) {
    const qty = decimalToNumber(line.qty);
    const productName = line.kitProductName
      ? `${line.product.displayName} (from ${line.kitProductName})`
      : line.product.displayName;
    const qtyLabel = `${qty.toLocaleString("en-IN")} Units`;
    const serials =
      line.serials.map((entry) => entry.serial.serialNumber).join(", ") || "—";
    const hsnLine = line.product.hsn ? `HSN: ${line.product.hsn}` : null;

    doc.font(fonts.bold).fontSize(10);
    const nameHeight = doc.heightOfString(productName, { width: nameWidth });
    doc.font(fonts.regular).fontSize(8.5);
    const hsnHeight = hsnLine ? doc.heightOfString(hsnLine, { width: CONTENT_WIDTH }) + 2 : 0;
    const serialLabelHeight = 14;
    const serialsHeight = doc.heightOfString(serials, { width: CONTENT_WIDTH });
    const blockHeight =
      Math.max(nameHeight, 12) + hsnHeight + serialLabelHeight + serialsHeight + 16;

    if (y + blockHeight > opts.pageBottom && index > 0) {
      doc.addPage();
      y = drawHeader(MARGIN_TOP);
    }

    const nameTop = y + 8;
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(palette.ink)
      .text(productName, CONTENT_LEFT + 5, nameTop, { width: nameWidth - 5 });

    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(palette.ink)
      .text(qtyLabel, CONTENT_RIGHT - qtyWidth - 5, nameTop, {
        width: qtyWidth,
        align: "right",
      });

    y = nameTop + Math.max(nameHeight, 12) + 2;

    if (hsnLine) {
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(palette.muted)
        .text(hsnLine, CONTENT_LEFT + 5, y, { width: CONTENT_WIDTH - 10 });
      y = doc.y + 2;
    }

    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(palette.faint)
      .text("Serial Numbers", CONTENT_LEFT + 5, y, { width: CONTENT_WIDTH - 10 });
    y = doc.y + 1;

    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(palette.ink)
      .text(serials, CONTENT_LEFT + 5, y, { width: CONTENT_WIDTH - 10 });
    y = doc.y + 10;

    if (index < opts.lines.length - 1) {
      doc
        .moveTo(CONTENT_LEFT, y)
        .lineTo(CONTENT_RIGHT, y)
        .lineWidth(0.5)
        .strokeColor(palette.border)
        .stroke();
      y += 10;
    }
  }

  return y;
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function signatureImageBuffer(signatureData: string | null | undefined): Buffer | null {
  if (!signatureData?.startsWith("data:image/")) return null;
  const comma = signatureData.indexOf(",");
  if (comma < 0) return null;
  try {
    return Buffer.from(signatureData.slice(comma + 1), "base64");
  } catch {
    return null;
  }
}

export async function generateProjectDispatchPdf(
  dispatch: ProjectDispatchRecord,
): Promise<Buffer> {
  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(dispatch.company.code);
  const ctx: DocContext = { doc, palette, fonts };

  const profile = resolveProfile(dispatch.company);
  const logo = companyLogo(dispatch.company.code);
  const pageBottom = doc.page.height - MARGIN_BOTTOM;

  const meta: Array<[string, string]> = [
    ["Challan #", dispatch.dispatchNo],
    ["Date", formatDocumentDate(dispatch.dispatchedAt ?? dispatch.createdAt)],
    ["Project #", dispatch.project.projectNo],
    ["Proposal #", dispatch.project.proposal.proposalNo],
  ];

  const headerBottom = drawDocumentHeader(ctx, {
    logo,
    companyName: dispatch.company.name,
    title: "Project Dispatch / Delivery Challan",
    profile,
    meta,
  });

  const customerLines = [
    dispatch.project.siteAddress,
    `Mobile: ${dispatch.project.customerMobile}`,
  ].filter(Boolean);

  const dispatchLines = [dispatch.warehouse.name];
  if (dispatch.vehicleNo) dispatchLines.push(`Vehicle: ${dispatch.vehicleNo}`);

  const partiesBottom = drawParties(ctx, {
    top: headerBottom + 22,
    left: {
      label: "DELIVER TO",
      name: dispatch.project.customerName,
      lines: customerLines,
    },
    right: {
      label: "DISPATCHED FROM",
      name: dispatch.warehouse.name,
      lines: dispatchLines.slice(1),
    },
  });

  const linesBottom = drawProjectDispatchLines(ctx, {
    top: partiesBottom + 18,
    pageBottom,
    lines: dispatch.lines,
  });

  let y = linesBottom + 12;

  if (dispatch.remarks) {
    const after = sectionTitle(ctx, "Notes", CONTENT_LEFT, y);
    doc.font(fonts.regular).fontSize(9).fillColor(palette.ink).text(dispatch.remarks, CONTENT_LEFT, after + 2, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 12;
  }

  const after = sectionTitle(ctx, "Terms", CONTENT_LEFT, y, CONTENT_WIDTH);
  let termsY = after + 2;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  for (const [index, term] of DISPATCH_TERMS.entries()) {
    doc.text(`${index + 1}. ${term}`, CONTENT_LEFT, termsY, {
      width: CONTENT_WIDTH,
    });
    termsY = doc.y + 4;
  }
  y = termsY + 8;

  const signatureImage = signatureImageBuffer(dispatch.signatureData);
  const signatureBlockHeight = signatureImage ? 100 : 50;
  const signTop = y + 24;
  if (signTop + signatureBlockHeight < pageBottom) {
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text("Received in good condition", CONTENT_LEFT, signTop, {
      width: 220,
    });

    let signatureLabelY = signTop + 26;
    if (signatureImage) {
      try {
        doc.image(signatureImage, CONTENT_LEFT, signTop + 14, {
          fit: [180, 48],
        });
        signatureLabelY = signTop + 66;
      } catch {
        // Fall back to label-only signature block if the image cannot be embedded.
      }
    }

    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text("Receiver's Signature", CONTENT_LEFT, signatureLabelY, {
      width: 220,
    });
    if (dispatch.receiverName) {
      doc.font(fonts.regular).fontSize(8).fillColor(palette.muted).text(dispatch.receiverName, CONTENT_LEFT, signatureLabelY + 14, {
        width: 220,
      });
    }

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
