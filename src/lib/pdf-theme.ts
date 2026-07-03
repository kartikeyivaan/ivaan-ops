import fs from "node:fs";
import path from "node:path";

/**
 * ---------------------------------------------------------------------------
 * Shared PDF theme for all company documents.
 * ---------------------------------------------------------------------------
 * Each company owns a colour palette + logo so its documents are instantly
 * recognisable:
 *   • Ivaan Solar Energy (ISE)  → charcoal + solar-gold (matches the ISE logo)
 *   • PCM Ventures (PCMV)       → navy + blue (matches the PCM logo)
 *
 * The palette/logo/profile are all resolved from the company `code`, so a
 * single set of drawing helpers renders on-brand output for either company.
 */

export type Palette = {
  primary: string; // dark brand bar / box background
  primaryText: string; // text drawn on top of `primary`
  accent: string; // section titles & highlights
  accentSoft: string; // light tint for totals / bands
  ink: string; // primary body text
  muted: string; // secondary text
  faint: string; // small labels
  border: string; // hairlines
  zebra: string; // alternating table rows
};

export const ISE_PALETTE: Palette = {
  primary: "#1C1C1C",
  primaryText: "#FFFFFF",
  accent: "#E8912D",
  accentSoft: "#FBF1E2",
  ink: "#20242E",
  muted: "#6B7280",
  faint: "#9AA1AC",
  border: "#E7E3DC",
  zebra: "#FAF8F4",
};

export const PCM_PALETTE: Palette = {
  primary: "#0F2F5F",
  primaryText: "#FFFFFF",
  accent: "#3E82C4",
  accentSoft: "#EAF1FA",
  ink: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  zebra: "#F6F9FC",
};

export function resolvePalette(companyCode: string | null | undefined): Palette {
  if (companyCode === "PCMV") return PCM_PALETTE;
  return ISE_PALETTE;
}

// ---------------------------------------------------------------------------
// Assets (logos + Unicode font so the ₹ glyph renders).
// ---------------------------------------------------------------------------
const ASSET_ROOT = path.join(process.cwd(), "assets");
const FONT_REGULAR = path.join(ASSET_ROOT, "fonts", "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(ASSET_ROOT, "fonts", "NotoSans-Bold.ttf");
const LOGO_ISE = path.join(ASSET_ROOT, "branding", "ivaan-solar-logo.png");
const LOGO_PCM = path.join(ASSET_ROOT, "branding", "pcm-ventures-logo.png");

export function readAsset(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export function companyLogo(companyCode: string | null | undefined): Buffer | null {
  if (companyCode === "PCMV") return readAsset(LOGO_PCM);
  return readAsset(LOGO_ISE);
}

export type PdfFonts = { regular: string; bold: string; rupee: string };

export function setupFonts(doc: PDFKit.PDFDocument): PdfFonts {
  const regular = readAsset(FONT_REGULAR);
  const bold = readAsset(FONT_BOLD);
  if (regular && bold) {
    doc.registerFont("body", regular);
    doc.registerFont("body-bold", bold);
    return { regular: "body", bold: "body-bold", rupee: "\u20B9" };
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold", rupee: "Rs. " };
}

export function makeMoney(rupee: string): (value: number) => string {
  return (value: number) =>
    `${rupee}${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Company profile (address / contact / bank / terms).
// Not yet modelled on the Company table, so kept here keyed by company code.
// ---------------------------------------------------------------------------
export type CompanyProfile = {
  addressLines: string[];
  tagline?: string;
  phone?: string;
  email?: string;
  gst?: string;
  bankDetails: string;
  terms: string[];
};

export const DEFAULT_TERMS = [
  "Payment: 100% advance payment is required prior to dispatch of goods.",
  "Taxes: GST and other applicable taxes shall be charged as per prevailing government norms.",
  "Transportation: Transportation charges are extra, at actual cost. Unloading and transit insurance are in the client's scope.",
  "Warranty: Warranty is as per respective OEM / manufacturer terms and conditions.",
  "Order Cancellation: Cancellation after order confirmation attracts charges of 5% of the total PI / Invoice value.",
  "Inspection of Goods: Fragile or damage-prone items must be inspected at the time of dispatch / delivery. No claims for transit or handling damage shall be entertained after dispatch.",
  "Quotation Validity: This quotation is valid for the period stated on the document. Prices and availability are subject to revision thereafter.",
  "Delivery: Delivery timelines are indicative and subject to stock availability and logistics conditions.",
  "Title & Risk: Title and risk in the goods pass to the client upon dispatch from our warehouse.",
];

/** Company fields read from the database to build a printable document profile. */
export type CompanyProfileSource = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  tagline?: string | null;
  bankDetails?: string | null;
  termsAndConditions?: string | null;
};

/** Builds the printable company profile purely from database-backed fields. */
export function resolveProfile(company: CompanyProfileSource): CompanyProfile {
  const addressLines: string[] = [];
  if (company.address) {
    for (const line of company.address.split("\n")) {
      if (line.trim()) addressLines.push(line.trim());
    }
  }
  const locality = [company.city, [company.state, company.pincode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (locality) addressLines.push(`${locality}, IN`);

  return {
    addressLines,
    tagline: company.tagline ?? undefined,
    phone: company.phone ?? undefined,
    email: company.email ?? undefined,
    gst: company.gstNumber ?? undefined,
    bankDetails: company.bankDetails ?? "",
    terms: company.termsAndConditions
      ? company.termsAndConditions.split("\n").filter(Boolean)
      : DEFAULT_TERMS,
  };
}

// ---------------------------------------------------------------------------
// Page geometry (portrait A4). Landscape docs recompute from doc.page.
// ---------------------------------------------------------------------------
export const A4 = { width: 595.28, height: 841.89 } as const;
export const MARGIN_X = 40;
export const MARGIN_TOP = 44;
export const MARGIN_BOTTOM = 84;
export const CONTENT_LEFT = MARGIN_X;
export const CONTENT_RIGHT = A4.width - MARGIN_X;
export const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
export const CELL_PAD = 5;

export function createDocOptions(landscape = false): PDFKit.PDFDocumentOptions {
  return {
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
    bufferPages: true,
    margins: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: MARGIN_BOTTOM },
  };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
export type DocContext = {
  doc: PDFKit.PDFDocument;
  palette: Palette;
  fonts: PdfFonts;
};

/** Header: logo + document title + meta rows, and the company address block. */
export function drawDocumentHeader(
  ctx: DocContext,
  opts: {
    logo: Buffer | null;
    companyName: string;
    title: string;
    profile: CompanyProfile;
    meta: Array<[string, string]>;
  },
): number {
  const { doc, palette, fonts } = ctx;
  const top = MARGIN_TOP;

  if (opts.logo) {
    doc.image(opts.logo, CONTENT_LEFT, top, { fit: [190, 56] });
  } else {
    doc.font(fonts.bold).fontSize(20).fillColor(palette.ink).text(opts.companyName, CONTENT_LEFT, top);
  }

  doc
    .font(fonts.bold)
    .fontSize(24)
    .fillColor(palette.primary)
    .text(opts.title.toUpperCase(), CONTENT_LEFT, top + 2, { width: CONTENT_WIDTH, align: "right" });
  doc
    .moveTo(CONTENT_RIGHT - 150, top + 33)
    .lineTo(CONTENT_RIGHT, top + 33)
    .lineWidth(2)
    .strokeColor(palette.accent)
    .stroke();

  let metaY = top + 42;
  doc.fontSize(9);
  for (const [label, value] of opts.meta) {
    doc.font(fonts.regular).fillColor(palette.muted).text(label, CONTENT_RIGHT - 220, metaY, {
      width: 95,
      align: "right",
    });
    doc.font(fonts.bold).fillColor(palette.ink).text(value, CONTENT_RIGHT - 120, metaY, {
      width: 120,
      align: "right",
    });
    metaY += 14;
  }

  let addrY = top + 64;
  doc.font(fonts.bold).fontSize(11).fillColor(palette.ink).text(opts.companyName, CONTENT_LEFT, addrY);
  addrY = doc.y + 1;
  if (opts.profile.tagline) {
    doc.font(fonts.bold).fontSize(8.5).fillColor(palette.accent).text(opts.profile.tagline, CONTENT_LEFT, addrY, {
      width: 300,
    });
    addrY = doc.y + 1;
  }
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.muted);
  for (const line of opts.profile.addressLines) {
    doc.text(line, CONTENT_LEFT, addrY, { width: 300 });
    addrY = doc.y;
  }
  const contactBits = [opts.profile.phone, opts.profile.email].filter(Boolean).join("  |  ");
  if (contactBits) {
    doc.font(fonts.regular).fillColor(palette.muted).text(contactBits, CONTENT_LEFT, addrY, { width: 320 });
    addrY = doc.y;
  }
  if (opts.profile.gst) {
    doc.font(fonts.bold).fillColor(palette.ink).text(`GSTIN: ${opts.profile.gst}`, CONTENT_LEFT, addrY, {
      width: 300,
    });
    addrY = doc.y;
  }

  return Math.max(addrY, metaY);
}

export type PartyInfo = { label: string; name: string; lines: string[] };

/**
 * Draws the "Bill To / Deliver To" band. A hairline is drawn at `top` with a
 * clear gap before the labels so the section is visually separated from the
 * company block above it.
 */
export function drawParties(
  ctx: DocContext,
  opts: { top: number; left: PartyInfo; right?: PartyInfo },
): number {
  const { doc, palette, fonts } = ctx;

  doc
    .moveTo(CONTENT_LEFT, opts.top)
    .lineTo(CONTENT_RIGHT, opts.top)
    .lineWidth(0.75)
    .strokeColor(palette.border)
    .stroke();

  const labelY = opts.top + 14;
  const colWidth = CONTENT_WIDTH * 0.55;

  doc.font(fonts.bold).fontSize(9).fillColor(palette.faint).text(opts.left.label, CONTENT_LEFT, labelY);
  doc.font(fonts.bold).fontSize(11).fillColor(palette.ink).text(opts.left.name, CONTENT_LEFT, doc.y + 1, {
    width: colWidth,
  });
  let leftY = doc.y;
  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted);
  for (const line of opts.left.lines) {
    doc.text(line, CONTENT_LEFT, leftY, { width: colWidth });
    leftY = doc.y;
  }

  let rightY = labelY;
  if (opts.right) {
    const rx = CONTENT_RIGHT - 210;
    doc.font(fonts.bold).fontSize(9).fillColor(palette.faint).text(opts.right.label, rx, labelY, {
      width: 210,
      align: "right",
    });
    doc.font(fonts.bold).fontSize(10).fillColor(palette.ink).text(opts.right.name, rx, doc.y + 1, {
      width: 210,
      align: "right",
    });
    rightY = doc.y;
    doc.font(fonts.regular).fontSize(9).fillColor(palette.muted);
    for (const line of opts.right.lines) {
      doc.text(line, rx, rightY, { width: 210, align: "right" });
      rightY = doc.y;
    }
  }

  return Math.max(leftY, rightY);
}

export function sectionTitle(ctx: DocContext, text: string, x: number, y: number, width?: number): number {
  const { doc, palette, fonts } = ctx;
  doc.font(fonts.bold).fontSize(9).fillColor(palette.accent).text(text.toUpperCase(), x, y, {
    width: width ?? CONTENT_WIDTH,
  });
  return doc.y;
}

export type TableColumn = {
  key: string;
  label: string;
  width: number;
  align: "left" | "center" | "right";
  bold?: boolean;
};

/** Generic themed table used by every document. Returns the y after the last row and the column x-map. */
export function drawTable(
  ctx: DocContext,
  opts: {
    top: number;
    left?: number;
    columns: TableColumn[];
    rows: Array<Record<string, string>>;
    pageBottom: number;
    newPageTop?: number;
  },
): { y: number; columnX: Record<string, number> } {
  const { doc, palette, fonts } = ctx;
  const left = opts.left ?? CONTENT_LEFT;
  const tableWidth = opts.columns.reduce((sum, col) => sum + col.width, 0);
  const newPageTop = opts.newPageTop ?? MARGIN_TOP;

  const columnX: Record<string, number> = {};
  let runningX = left;
  for (const col of opts.columns) {
    columnX[col.key] = runningX;
    runningX += col.width;
  }

  const drawHeaderRow = (top: number): number => {
    const rowHeight = 22;
    doc.rect(left, top, tableWidth, rowHeight).fill(palette.primary);
    doc.font(fonts.bold).fontSize(8.5).fillColor(palette.primaryText);
    for (const col of opts.columns) {
      doc.text(col.label, columnX[col.key] + CELL_PAD, top + 7, {
        width: col.width - CELL_PAD * 2,
        align: col.align,
      });
    }
    return top + rowHeight;
  };

  let y = drawHeaderRow(opts.top);
  doc.fontSize(8.5);

  opts.rows.forEach((row, rowIndex) => {
    let rowHeight = 20;
    for (const col of opts.columns) {
      const h = doc.heightOfString(row[col.key] ?? "", { width: col.width - CELL_PAD * 2 }) + 8;
      if (h > rowHeight) rowHeight = h;
    }

    if (y + rowHeight > opts.pageBottom) {
      doc.addPage();
      y = drawHeaderRow(newPageTop);
      doc.fontSize(8.5);
    }

    if (rowIndex % 2 === 1) {
      doc.rect(left, y, tableWidth, rowHeight).fill(palette.zebra);
    }

    doc.fillColor(palette.ink);
    for (const col of opts.columns) {
      doc.font(col.bold ? fonts.bold : fonts.regular);
      doc.text(row[col.key] ?? "", columnX[col.key] + CELL_PAD, y + 6, {
        width: col.width - CELL_PAD * 2,
        align: col.align,
      });
    }
    y += rowHeight;
    doc.moveTo(left, y).lineTo(left + tableWidth, y).lineWidth(0.5).strokeColor(palette.border).stroke();
  });

  return { y, columnX };
}

/** Footer drawn on every page: company contact line + page numbers. No third-party branding. */
export function drawFooter(ctx: DocContext, companyLine: string): void {
  const { doc, palette, fonts } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Footer sits below the normal bottom margin; drop the margin so PDFKit
    // does not auto-insert blank pages while drawing it.
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 54;
    const rightEdge = doc.page.width - MARGIN_X;

    doc
      .moveTo(CONTENT_LEFT, footerY)
      .lineTo(rightEdge, footerY)
      .lineWidth(0.5)
      .strokeColor(palette.border)
      .stroke();

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(palette.muted)
      .text(companyLine, CONTENT_LEFT, footerY + 9, {
        width: rightEdge - CONTENT_LEFT,
        align: "center",
        lineBreak: false,
      });

    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(palette.faint)
      .text(`Page ${i - range.start + 1} of ${range.count}`, CONTENT_LEFT, footerY + 9, {
        width: 120,
        align: "left",
        lineBreak: false,
      });
  }
}

// ---------------------------------------------------------------------------
// Amount in words (Indian numbering system).
// ---------------------------------------------------------------------------
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens];
}

function numberToIndianWords(value: number): string {
  if (value === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  const hundred = Math.floor(value / 100);
  const rest = value % 100;

  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ");
}

/** Formats a rupee value as words, e.g. "Rupees Two Lakh Six Thousand Four Hundred Eighty Three Only". */
export function amountInWords(value: number): string {
  const rupees = Math.floor(Math.round(value * 100) / 100);
  const paise = Math.round((value - rupees) * 100);
  let words = `Rupees ${numberToIndianWords(rupees)}`;
  if (paise > 0) words += ` and ${twoDigitWords(paise)} Paise`;
  return `${words} Only`;
}

// ---------------------------------------------------------------------------
// HSN-wise GST summary (place-of-supply aware: CGST+SGST intra-state, IGST inter-state).
// ---------------------------------------------------------------------------
export type GstGroup = { hsn: string; taxable: number; gstRate: number; gstAmount: number };

export function isIntraState(companyState?: string | null, customerState?: string | null): boolean {
  if (!companyState || !customerState) return true; // default to local supply
  return companyState.trim().toLowerCase() === customerState.trim().toLowerCase();
}

/** Aggregates per-line taxable/GST amounts into HSN + rate groups. */
export function buildGstGroups(
  lines: Array<{ hsn?: string | null; taxable: number; gstRate: number; gstAmount: number }>,
): GstGroup[] {
  const map = new Map<string, GstGroup>();
  for (const line of lines) {
    const hsn = line.hsn?.trim() || "—";
    const key = `${hsn}|${line.gstRate}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxable += line.taxable;
      existing.gstAmount += line.gstAmount;
    } else {
      map.set(key, { hsn, taxable: line.taxable, gstRate: line.gstRate, gstAmount: line.gstAmount });
    }
  }
  return [...map.values()];
}

/** Draws the HSN-wise GST summary table. Returns the y after the table. */
export function drawGstSummary(
  ctx: DocContext,
  opts: {
    top: number;
    groups: GstGroup[];
    intraState: boolean;
    money: (value: number) => string;
    pageBottom: number;
  },
): number {
  if (opts.groups.length === 0) return opts.top;

  const after = sectionTitle(ctx, "HSN-wise GST Summary", CONTENT_LEFT, opts.top);
  const tableTop = after + 4;

  const columns: TableColumn[] = opts.intraState
    ? [
        { key: "hsn", label: "HSN", width: 78, align: "left", bold: true },
        { key: "taxable", label: "Taxable Value", width: 92, align: "right" },
        { key: "cgstR", label: "CGST %", width: 52, align: "center" },
        { key: "cgstA", label: "CGST Amt", width: 78, align: "right" },
        { key: "sgstR", label: "SGST %", width: 52, align: "center" },
        { key: "sgstA", label: "SGST Amt", width: 78, align: "right" },
        { key: "total", label: "Total Tax", width: 85, align: "right" },
      ]
    : [
        { key: "hsn", label: "HSN", width: 110, align: "left", bold: true },
        { key: "taxable", label: "Taxable Value", width: 130, align: "right" },
        { key: "igstR", label: "IGST %", width: 70, align: "center" },
        { key: "igstA", label: "IGST Amt", width: 105, align: "right" },
        { key: "total", label: "Total Tax", width: 100, align: "right" },
      ];

  let totalTaxable = 0;
  let totalGst = 0;
  const rows: Array<Record<string, string>> = [];
  for (const group of opts.groups) {
    totalTaxable += group.taxable;
    totalGst += group.gstAmount;
    const half = group.gstAmount / 2;
    const halfRate = group.gstRate / 2;
    const row: Record<string, string> = { hsn: group.hsn, taxable: opts.money(group.taxable) };
    if (opts.intraState) {
      row.cgstR = `${halfRate}%`;
      row.cgstA = opts.money(half);
      row.sgstR = `${halfRate}%`;
      row.sgstA = opts.money(half);
    } else {
      row.igstR = `${group.gstRate}%`;
      row.igstA = opts.money(group.gstAmount);
    }
    row.total = opts.money(group.gstAmount);
    rows.push(row);
  }

  const totalRow: Record<string, string> = { hsn: "Total", taxable: opts.money(totalTaxable) };
  if (opts.intraState) {
    totalRow.cgstA = opts.money(totalGst / 2);
    totalRow.sgstA = opts.money(totalGst / 2);
  } else {
    totalRow.igstA = opts.money(totalGst);
  }
  totalRow.total = opts.money(totalGst);
  rows.push(totalRow);

  const { y } = drawTable(ctx, { top: tableTop, columns, rows, pageBottom: opts.pageBottom });
  return y;
}
