import PDFDocument from "pdfkit";
import { COURIER_STICKER_MAX_BOXES } from "@/lib/courier-sticker-constants";
import {
  A4,
  companyLogo,
  resolvePalette,
  resolveProfile,
  setupFonts,
  type CompanyProfileSource,
  type Palette,
  type PdfFonts,
} from "@/lib/pdf-theme";

export type CourierStickerCustomer = {
  customerName: string;
  contactPersonName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  mobile?: string | null;
};

export type CourierStickerInput = {
  dcNo: string;
  invoiceNumber?: string | null;
  boxCount: number;
  customer: CourierStickerCustomer;
  company: CompanyProfileSource & { name: string; code: string | null };
};

const PAGE_MARGIN = 18;
const GUTTER = 6;
const COLS = 2;
const ROWS = 4;
const STICKERS_PER_PAGE = COLS * ROWS;
const LABEL_PAD = 8;
const BOX_PANEL_W = 52;
const MM = 72 / 25.4;
/** Indent TO body text to the right of the TO label. */
const TO_CONTENT_INDENT = 5 * MM;
/** Nudge FROM logo downward. */
const LOGO_OFFSET_Y = 4 * MM;
/** Tight gap between consecutive TO / FROM content lines. */
const LINE_GAP = 1;

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * TO block: firm name (bold) first, optional contact person below.
 * Contact is omitted when missing or identical to the firm name.
 */
export function resolveCourierRecipient(customer: CourierStickerCustomer): {
  firmName: string;
  contactName: string | null;
} {
  const firm = customer.customerName.trim() || "—";
  const contact = customer.contactPersonName?.trim() || "";
  if (contact && contact.toLowerCase() !== firm.toLowerCase()) {
    return { firmName: firm, contactName: contact };
  }
  return { firmName: firm, contactName: null };
}

function customerAddressLines(customer: CourierStickerCustomer): string[] {
  const lines: string[] = [];
  if (customer.address) {
    for (const line of customer.address.split("\n")) {
      if (line.trim()) lines.push(line.trim());
    }
  }
  const locality = [customer.city, customer.state].filter(Boolean).join(", ");
  const withPin = [locality, customer.pinCode?.trim()].filter(Boolean).join(" ");
  if (withPin) lines.push(withPin);
  return lines;
}

/**
 * Formats company address for stickers as short comma-ended street lines,
 * then the city / state / pin line unchanged.
 * e.g. "Opp. K. U. Kolhe School, Old Nashirabad Road" →
 *   Opp. K. U. Kolhe School,
 *   Old Nashirabad Road,
 *   Jalgaon, Maharashtra 425001, IN
 */
export function formatCourierFromAddressLines(addressLines: string[]): string[] {
  const out: string[] = [];
  for (const line of addressLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/,\s*IN\s*$/i.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    const parts = trimmed
      .replace(/,\s*$/, "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    for (const part of parts) {
      out.push(`${part},`);
    }
  }
  return out;
}

function drawCutGuide(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
) {
  doc
    .save()
    .lineWidth(0.6)
    .dash(2.5, { space: 2 })
    .strokeColor(accent)
    .rect(x, y, w, h)
    .stroke()
    .undash()
    .restore();
}

function drawSectionLabel(
  doc: PDFKit.PDFDocument,
  fonts: PdfFonts,
  palette: Palette,
  label: string,
  x: number,
  y: number,
) {
  doc
    .font(fonts.bold)
    .fontSize(6.5)
    .fillColor(palette.accent)
    .text(label, x, y, { lineBreak: false, characterSpacing: 0.6 });
  return doc.y;
}

/** Draw text at y and return the next baseline after a fixed LINE_GAP. */
function drawLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts?: { lineBreak?: boolean; height?: number },
): number {
  doc.text(text, x, y, {
    width,
    lineBreak: opts?.lineBreak ?? true,
    ...(opts?.height != null ? { height: opts.height } : {}),
  });
  return doc.y + LINE_GAP;
}

function drawBoxPanel(
  doc: PDFKit.PDFDocument,
  fonts: PdfFonts,
  palette: Palette,
  opts: { x: number; y: number; w: number; h: number; boxIndex: number; boxCount: number },
) {
  doc
    .save()
    .lineWidth(1.2)
    .strokeColor(palette.accent)
    .roundedRect(opts.x, opts.y, opts.w, opts.h, 3)
    .stroke()
    .restore();

  let y = opts.y + 8;

  doc
    .font(fonts.bold)
    .fontSize(7)
    .fillColor(palette.accent)
    .text("BOX", opts.x, y, { width: opts.w, align: "center", lineBreak: false });
  y += 12;

  const numberSize = opts.boxIndex >= 100 ? 18 : opts.boxIndex >= 10 ? 22 : 26;
  doc.font(fonts.bold).fontSize(numberSize).fillColor(palette.ink);
  const numH = doc.heightOfString(String(opts.boxIndex), { width: opts.w });
  const numY = Math.max(y, opts.y + (opts.h - numH) / 2 - 4);
  doc.text(String(opts.boxIndex), opts.x, numY, {
    width: opts.w,
    align: "center",
    lineBreak: false,
  });

  doc
    .font(fonts.bold)
    .fontSize(7)
    .fillColor(palette.ink)
    .text(`OF ${opts.boxCount}`, opts.x, opts.y + opts.h - 16, {
      width: opts.w,
      align: "center",
      lineBreak: false,
    });
}

function drawFilledLabel(
  doc: PDFKit.PDFDocument,
  fonts: PdfFonts,
  palette: Palette,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    dcNo: string;
    invoiceNumber: string | null;
    boxIndex: number;
    boxCount: number;
    firmName: string;
    contactName: string | null;
    customerLines: string[];
    customerPhone: string;
    companyName: string;
    companyLines: string[];
    companyPhone: string;
    logo: Buffer | null;
  },
) {
  const { x, y, w, h } = opts;
  drawCutGuide(doc, x, y, w, h, palette.accent);

  const innerX = x + LABEL_PAD;
  const innerRight = x + w - LABEL_PAD;
  const innerW = innerRight - innerX;
  const contentBottom = y + h - LABEL_PAD;

  // --- Header ---
  let cursorY = y + LABEL_PAD;
  const headerH = 16;
  doc
    .save()
    .fillColor(palette.accentSoft)
    .roundedRect(innerX, cursorY, innerW, headerH, 2)
    .fill()
    .restore();

  const headerTextY = cursorY + 4;
  doc
    .font(fonts.bold)
    .fontSize(7.5)
    .fillColor(palette.ink)
    .text(`DC #: ${opts.dcNo}`, innerX + 4, headerTextY, {
      width: opts.invoiceNumber ? innerW * 0.58 : innerW - 8,
      lineBreak: false,
      ellipsis: true,
    });

  if (opts.invoiceNumber) {
    doc
      .font(fonts.bold)
      .fontSize(7.5)
      .fillColor(palette.ink)
      .text(`Invoice #: ${opts.invoiceNumber}`, innerX + innerW * 0.58, headerTextY, {
        width: innerW * 0.42 - 4,
        align: "right",
        lineBreak: false,
        ellipsis: true,
      });
  }

  cursorY += headerH + 5;
  doc
    .moveTo(innerX, cursorY)
    .lineTo(innerRight, cursorY)
    .lineWidth(0.7)
    .strokeColor(palette.accent)
    .stroke();
  cursorY += 5;

  // --- TO + Box panel ---
  const fromReserve = 58;
  const midBottom = contentBottom - fromReserve;
  const toTop = cursorY;
  const boxPanelH = Math.min(78, midBottom - toTop - 2);
  const boxPanelX = innerRight - BOX_PANEL_W;
  const boxPanelY = toTop + 10;

  drawSectionLabel(doc, fonts, palette, "TO", innerX, cursorY);
  cursorY = doc.y + LINE_GAP;

  const toContentX = innerX + TO_CONTENT_INDENT;
  const toTextW = boxPanelX - toContentX - 8;

  // 1) Firm name (bold)
  doc.font(fonts.bold).fontSize(12).fillColor(palette.ink);
  cursorY = drawLine(doc, opts.firmName, toContentX, cursorY, toTextW);

  // 2) Contact person (regular) — omit when absent
  if (opts.contactName) {
    doc.font(fonts.regular).fontSize(9.5).fillColor(palette.ink);
    cursorY = drawLine(doc, opts.contactName, toContentX, cursorY, toTextW);
  }

  // 3) Address lines — same gap between every line
  doc.font(fonts.regular).fontSize(9).fillColor(palette.ink);
  for (const line of opts.customerLines.slice(0, 4)) {
    if (cursorY > midBottom - 16) break;
    cursorY = drawLine(doc, line, toContentX, cursorY, toTextW);
  }

  // 4) Contact number
  if (opts.customerPhone && cursorY <= midBottom - 10) {
    doc.font(fonts.bold).fontSize(9.5).fillColor(palette.ink);
    drawLine(doc, `Ph: ${opts.customerPhone}`, toContentX, cursorY, toTextW, {
      lineBreak: false,
    });
  }

  drawBoxPanel(doc, fonts, palette, {
    x: boxPanelX,
    y: boxPanelY,
    w: BOX_PANEL_W,
    h: boxPanelH,
    boxIndex: opts.boxIndex,
    boxCount: opts.boxCount,
  });

  // --- Divider ---
  let fromY = midBottom;
  doc
    .moveTo(innerX, fromY)
    .lineTo(innerRight, fromY)
    .lineWidth(0.7)
    .strokeColor(palette.accent)
    .stroke();
  fromY += 4;

  // --- FROM: logo 40% | text 60% ---
  drawSectionLabel(doc, fonts, palette, "FROM", innerX, fromY);
  fromY = doc.y + LINE_GAP;

  const logoColW = innerW * 0.4;
  const textColX = innerX + logoColW;
  const textColW = innerW * 0.6;
  const fromBlockTop = fromY;

  if (opts.logo) {
    try {
      doc.image(opts.logo, innerX, fromBlockTop + LOGO_OFFSET_Y, {
        fit: [logoColW - 6, Math.max(28, contentBottom - fromBlockTop - LOGO_OFFSET_Y)],
      });
    } catch {
      // Layout still works without logo.
    }
  }

  let textY = fromBlockTop;
  doc.font(fonts.bold).fontSize(9).fillColor(palette.ink);
  textY = drawLine(doc, opts.companyName, textColX, textY, textColW - 2, {
    lineBreak: false,
  });

  doc.font(fonts.regular).fontSize(7.5).fillColor(palette.muted);
  for (const line of opts.companyLines.slice(0, 4)) {
    if (textY > contentBottom - 12) break;
    textY = drawLine(doc, line, textColX, textY, textColW - 2, { lineBreak: false });
  }

  if (opts.companyPhone && textY <= contentBottom - 8) {
    doc.font(fonts.regular).fontSize(8).fillColor(palette.ink);
    drawLine(doc, `Ph: ${opts.companyPhone}`, textColX, textY, textColW - 2, {
      lineBreak: false,
    });
  }
}

/**
 * Generates an A4 courier-label PDF: 2×4 labels per page with dashed cut guides.
 * Unused slots on the last page stay blank (cut outlines only).
 */
export async function generateCourierStickerPdf(input: CourierStickerInput): Promise<Buffer> {
  const boxCount = Math.floor(input.boxCount);
  if (!Number.isFinite(boxCount) || boxCount < 1 || boxCount > COURIER_STICKER_MAX_BOXES) {
    throw new Error(`Box count must be an integer between 1 and ${COURIER_STICKER_MAX_BOXES}.`);
  }

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    bufferPages: true,
    margins: { top: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN },
  });
  const fonts = setupFonts(doc);
  const palette = resolvePalette(input.company.code);
  const profile = resolveProfile(input.company);
  const logo = companyLogo(input.company.code);
  const invoiceNumber = input.invoiceNumber?.trim() || null;
  const { firmName, contactName } = resolveCourierRecipient(input.customer);
  const customerLines = customerAddressLines(input.customer);
  const customerPhone = input.customer.mobile?.trim() || "";
  const companyPhone = profile.phone?.trim() || "";

  const usableW = A4.width - PAGE_MARGIN * 2;
  const usableH = A4.height - PAGE_MARGIN * 2;
  const stickerW = (usableW - GUTTER * (COLS - 1)) / COLS;
  const stickerH = (usableH - GUTTER * (ROWS - 1)) / ROWS;

  const pageCount = Math.ceil(boxCount / STICKERS_PER_PAGE);

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage();

    for (let slot = 0; slot < STICKERS_PER_PAGE; slot += 1) {
      const boxIndex = page * STICKERS_PER_PAGE + slot + 1;
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);
      const x = PAGE_MARGIN + col * (stickerW + GUTTER);
      const y = PAGE_MARGIN + row * (stickerH + GUTTER);

      if (boxIndex > boxCount) {
        drawCutGuide(doc, x, y, stickerW, stickerH, palette.border);
        continue;
      }

      drawFilledLabel(doc, fonts, palette, {
        x,
        y,
        w: stickerW,
        h: stickerH,
        dcNo: input.dcNo,
        invoiceNumber,
        boxIndex,
        boxCount,
        firmName,
        contactName,
        customerLines,
        customerPhone,
        companyName: input.company.name,
        companyLines: formatCourierFromAddressLines(profile.addressLines),
        companyPhone,
        logo,
      });
    }
  }

  return collectPdfBuffer(doc);
}
