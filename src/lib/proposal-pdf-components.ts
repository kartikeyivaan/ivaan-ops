import type { BomLine } from "@/lib/proposal-bom";
import {
  CLIENT_SCOPE_ITEMS,
  CANCELLATION_POLICY,
  IVAAN_SCOPE_ITEMS,
  PAYMENT_MILESTONES,
  PROPOSAL_TERMS,
  formatCommercialOfferSubsidyNote,
  WAAREE_FRANCHISEE_TAGLINE,
  WAAREE_HIGHLIGHTS,
  WAAREE_INTRO,
  WARRANTY_FOOTNOTE,
  WARRANTY_ROWS,
} from "@/lib/proposal-pdf-content";
import {
  INSTALLATION_TIMELINE_FOOTER_NOTE,
  INSTALLATION_TIMELINE_GRID_COLUMNS,
  INSTALLATION_TIMELINE_ICON_FILES,
  INSTALLATION_TIMELINE_PDF_ICONS,
  INSTALLATION_TIMELINE_ROWS,
  INSTALLATION_TIMELINE_THEME,
  INSTALLATION_TIMELINE_TITLE_EMPHASIS,
  INSTALLATION_TIMELINE_TITLE_LEAD,
  type InstallationTimelineRow,
  type InstallationTimelineStep,
  type InstallationTimelineIcon,
} from "@/lib/installation-timeline";
import { buildTimelineRoadmapPath, computeBendOutset, computeMilestoneCenters } from "@/lib/timeline-roadmap-geometry";
import {
  CELL_PAD,
  companyLogo,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  drawTable,
  MARGIN_TOP,
  readAsset,
  type DocContext,
  type TableColumn,
  waareeLogo,
} from "@/lib/pdf-theme";
import path from "node:path";
import { formatDocumentDate } from "@/lib/utils";
import {
  GST_SPLIT_HIGH_RATE,
  GST_SPLIT_HIGH_WEIGHT,
  GST_SPLIT_LOW_RATE,
  GST_SPLIT_LOW_WEIGHT,
} from "@/lib/project-proposal-pricing";

/** Consistent vertical space before each premium section heading. */
export const SECTION_GAP_BEFORE_PT = 14;

/** Premium presentation tokens layered on top of the shared palette. */
const PREMIUM = {
  cardBg: "#FAFBFC",
  cardBorder: "#E5E7EB",
  shadow: "#D1D5DB",
  heading: "#1C1C1C",
  positive: "#059669",
  positiveSoft: "#ECFDF5",
  accentSoft: "#FFF7ED",
  checkIcon: "\u2713",
  alertIcon: "\u25CF",
} as const;

export type ProposalLayoutContext = DocContext & { pageBottom: number };

export function ensurePageSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  neededHeight: number,
  pageBottom: number,
): number {
  if (y + neededHeight > pageBottom) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return y;
}

function drawCard(
  ctx: DocContext,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 6,
  fill = "#FFFFFF",
): void {
  const { doc, palette } = ctx;
  doc.roundedRect(x + 1, y + 1.5, w, h, radius).fill(PREMIUM.shadow);
  doc.roundedRect(x, y, w, h, radius).fill(fill);
  doc.roundedRect(x, y, w, h, radius).lineWidth(0.5).strokeColor(palette.border).stroke();
}

export type SectionTitleOptions = {
  pageBottom?: number;
  /** Minimum height of content following the title; keeps the orange bar with its section. */
  minFollowingHeight?: number;
  /** Skip the standard pre-section gap (use sparingly). */
  skipGapBefore?: boolean;
};

const GENERATION_CHART_HEIGHT_PT = 76;
const GENERATION_CHART_CARD_PAD = 10;
const GENERATION_CHART_TITLE_H = 11;
const GENERATION_CHART_TITLE_GAP = 6;
const GENERATION_CHART_LABEL_H = 14;
const GENERATION_NOTE_GAP = 8;

function getGenerationChartCardHeight(chartHeight = GENERATION_CHART_HEIGHT_PT): number {
  return (
    GENERATION_CHART_CARD_PAD * 2 +
    GENERATION_CHART_TITLE_H +
    GENERATION_CHART_TITLE_GAP +
    chartHeight +
    GENERATION_CHART_LABEL_H
  );
}

function measureWarrantyCardsHeight(ctx: ProposalLayoutContext): number {
  const { doc, fonts } = ctx;
  const gap = 10;
  const cardW = (CONTENT_WIDTH - gap * 2) / 3;
  const pad = 12;
  const innerW = cardW - pad * 2;
  doc.font(fonts.regular).fontSize(7);
  const detailsBlockH = Math.max(
    ...WARRANTY_ROWS.map(([, details]) => doc.heightOfString(details, { width: innerW })),
  );
  return pad + 16 + 20 + detailsBlockH + pad;
}

function measureWarrantySectionHeight(ctx: ProposalLayoutContext): number {
  const { doc, fonts } = ctx;
  const titleBlockH = 30;
  const cardH = measureWarrantyCardsHeight(ctx);
  doc.font(fonts.regular).fontSize(8);
  const footnoteH = 6 + doc.heightOfString(WARRANTY_FOOTNOTE, { width: CONTENT_WIDTH });
  return titleBlockH + cardH + footnoteH;
}

export function estimateProjectSummaryCardHeight(rowCount: number): number {
  const rowH = 28;
  const cardRows = Math.ceil(rowCount / 2);
  return 16 + cardRows * rowH + 12;
}

export function estimateGenerationEstimateSectionMinHeight(): number {
  const chartCardH = getGenerationChartCardHeight();
  const disclaimerH = 44;
  return chartCardH + GENERATION_NOTE_GAP + disclaimerH;
}

export function estimateWarrantySectionMinHeight(): number {
  const titleBlockH = 30;
  const cardH = 106;
  const footnoteH = 18;
  return titleBlockH + cardH + footnoteH;
}

export function startNewPage(ctx: ProposalLayoutContext): number {
  ctx.doc.addPage();
  return MARGIN_TOP;
}

export function drawPremiumSectionTitle(
  ctx: DocContext,
  text: string,
  x: number,
  y: number,
  width = CONTENT_WIDTH,
  compact = false,
  options?: SectionTitleOptions,
): number {
  const { doc, palette, fonts } = ctx;
  const titleBlockH = compact ? 22 : 30;
  if (!options?.skipGapBefore) {
    y += SECTION_GAP_BEFORE_PT;
  }
  if (options?.pageBottom != null && options.minFollowingHeight != null) {
    y = ensurePageSpace(doc, y, titleBlockH + options.minFollowingHeight, options.pageBottom);
  }
  doc.rect(x, y + 1, 3, 16).fill(palette.accent);
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor(PREMIUM.heading)
    .text(text.toUpperCase(), x + 10, y, { width: width - 10 });
  const lineY = doc.y + (compact ? 3 : 5);
  doc
    .moveTo(x, lineY)
    .lineTo(x + width, lineY)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();
  return lineY + (compact ? 3 : 8);
}

export function drawDualBrandProposalHeader(
  ctx: DocContext,
  opts: {
    companyCode: string;
    companyName: string;
    title: string;
    meta: Array<[string, string]>;
  },
): number {
  const { doc, palette, fonts } = ctx;
  const top = MARGIN_TOP;
  const iseLogo = companyLogo(opts.companyCode);
  const waaree = waareeLogo();
  const logoH = 48;
  const logoW = 150;

  if (iseLogo) {
    doc.image(iseLogo, CONTENT_LEFT, top, { fit: [logoW, logoH] });
  } else {
    doc.font(fonts.bold).fontSize(14).fillColor(palette.ink).text(opts.companyName, CONTENT_LEFT, top);
  }

  const taglineY = top + logoH + 4;
  doc
    .font(fonts.bold)
    .fontSize(8.5)
    .fillColor(palette.accent)
    .text(WAAREE_FRANCHISEE_TAGLINE, CONTENT_LEFT, taglineY, {
      width: logoW,
      align: "center",
    });

  if (waaree) {
    doc.image(waaree, CONTENT_RIGHT - 120, top, { fit: [110, logoH] });
  }

  const titleY = Math.max(doc.y, top + logoH) + 10;
  doc
    .font(fonts.bold)
    .fontSize(17)
    .fillColor(PREMIUM.heading)
    .text(opts.title.toUpperCase(), CONTENT_LEFT, titleY, { width: CONTENT_WIDTH, align: "center" });

  const cardY = doc.y + 12;
  const cardPad = 12;
  const colCount = 3;
  const colGap = 10;
  const colW = (CONTENT_WIDTH - cardPad * 2 - colGap * (colCount - 1)) / colCount;
  const cellH = 28;
  const rows = Math.ceil(opts.meta.length / colCount);
  const cardH = cardPad * 2 + rows * cellH;

  drawCard(ctx, CONTENT_LEFT, cardY, CONTENT_WIDTH, cardH, 8, PREMIUM.cardBg);

  opts.meta.forEach(([label, value], index) => {
    const col = index % colCount;
    const row = Math.floor(index / colCount);
    const x = CONTENT_LEFT + cardPad + col * (colW + colGap);
    const y = cardY + cardPad + row * cellH;
    doc.font(fonts.regular).fontSize(7).fillColor(palette.muted).text(label.toUpperCase(), x, y, { width: colW });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text(value, x, y + 11, { width: colW });
  });

  return cardY + cardH + 10;
}

export function drawCoverLetterPremium(
  ctx: DocContext,
  opts: {
    proposalDate: Date;
    customerName: string;
    systemKw: number;
    companyName: string;
  },
  top: number,
): number {
  const { doc, palette, fonts } = ctx;
  const pad = 14;
  const innerW = CONTENT_WIDTH - pad * 2;

  const subject = `Techno-Commercial Proposal for ${opts.systemKw} kWp On-Grid Rooftop Solar (SRTPV) System`;
  const paragraphs = [
    "With reference to our meeting and discussions, we are pleased to submit our offer for the above-mentioned on-grid solar rooftop system as per the scope defined herein.",
    "We trust this techno-commercial proposal meets your requirements. Please feel free to contact us for any further information.",
    "We look forward to a valuable association.",
  ];

  doc.font(fonts.regular).fontSize(9);
  let contentH = 10;
  contentH += doc.heightOfString(formatDocumentDate(opts.proposalDate), { width: innerW }) + 8;
  contentH += 16;
  contentH += doc.heightOfString(subject, { width: innerW }) + 8;
  for (const p of paragraphs) {
    contentH += doc.heightOfString(p, { width: innerW }) + 4;
  }
  contentH += 22;
  const cardH = contentH + pad * 2;

  drawCard(ctx, CONTENT_LEFT, top, CONTENT_WIDTH, cardH, 8, "#FFFFFF");

  let y = top + pad;
  const x = CONTENT_LEFT + pad;
  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(formatDocumentDate(opts.proposalDate), x, y);
  y = doc.y + 6;

  doc.font(fonts.bold).fontSize(11).fillColor(PREMIUM.heading).text(`Dear ${opts.customerName},`, x, y);
  y = doc.y + 6;

  doc.font(fonts.bold).fontSize(9).fillColor(palette.accent).text(`Subject: ${subject}`, x, y, { width: innerW });
  y = doc.y + 8;

  doc.font(fonts.regular).fontSize(9.5).fillColor(palette.ink);
  for (const paragraph of paragraphs) {
    doc.text(paragraph, x, y, { width: innerW });
    y = doc.y + 4;
  }

  doc.text("Thanking you,", x, y);
  y = doc.y + 3;
  doc.font(fonts.bold).text(`For ${opts.companyName}`, x, y);

  return top + cardH + 4;
}

/** PDF points per millimetre (72 pt/in ÷ 25.4 mm/in). */
export function mmToPt(mm: number): number {
  return mm * (72 / 25.4);
}

export type KpiCard = { label: string; value: string };

export type KpiGridOptions = {
  /** Override default card height in points. */
  cardHeightPt?: number;
  /** Extra gap below the grid in points. */
  bottomGapPt?: number;
};

function drawKpiGridInBounds(
  ctx: ProposalLayoutContext,
  cards: KpiCard[],
  x: number,
  y: number,
  width: number,
  totalHeight: number,
  columns = 2,
): void {
  const { doc, palette, fonts } = ctx;
  const gap = 8;
  const cardPad = 10;
  const rows = Math.ceil(cards.length / columns);
  const cardW = (width - gap * (columns - 1)) / columns;
  const cardH = (totalHeight - gap * (rows - 1)) / rows;

  cards.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    drawCard(ctx, cx, cy, cardW, cardH, 6, PREMIUM.cardBg);
    doc.font(fonts.regular).fontSize(7).fillColor(palette.muted).text(card.label.toUpperCase(), cx + cardPad, cy + cardPad, {
      width: cardW - cardPad * 2,
    });
    doc.font(fonts.bold).fontSize(9.5).fillColor(PREMIUM.heading).text(card.value, cx + cardPad, cy + cardPad + 12, {
      width: cardW - cardPad * 2,
    });
  });
}

export function drawKpiGrid(
  ctx: ProposalLayoutContext,
  cards: KpiCard[],
  top: number,
  columns = 3,
  options: KpiGridOptions = {},
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const gap = 8;
  const cardPad = 10;
  const cardW = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardH = options.cardHeightPt ?? 44;
  const bottomGap = options.bottomGapPt ?? 0;
  const rows = Math.ceil(cards.length / columns);
  const gridH = rows * cardH + (rows - 1) * gap;

  const y = ensurePageSpace(doc, top, gridH, pageBottom);

  cards.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = CONTENT_LEFT + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    drawCard(ctx, x, cy, cardW, cardH, 6, PREMIUM.cardBg);
    doc.font(fonts.regular).fontSize(7).fillColor(palette.muted).text(card.label.toUpperCase(), x + cardPad, cy + cardPad, {
      width: cardW - cardPad * 2,
    });
    doc.font(fonts.bold).fontSize(9.5).fillColor(PREMIUM.heading).text(card.value, x + cardPad, cy + cardPad + 12, {
      width: cardW - cardPad * 2,
    });
  });

  return y + gridH + bottomGap;
}

export function drawProjectSummaryCards(
  ctx: ProposalLayoutContext,
  rows: Array<[string, string]>,
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const colGap = 12;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const rowH = 28;
  const cardRows = Math.ceil(rows.length / 2);
  const cardH = 16 + cardRows * rowH + 12;

  const y = ensurePageSpace(doc, top, cardH, pageBottom);
  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH, 8, "#FFFFFF");

  const startY = y + 12;
  rows.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = CONTENT_LEFT + 14 + col * (colW + colGap);
    const ry = startY + row * rowH;
    doc.font(fonts.regular).fontSize(7.5).fillColor(palette.muted).text(label, x, ry, { width: colW - 20 });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text(value, x, ry + 11, { width: colW - 20 });
  });

  return y + cardH;
}

export type PricingData = {
  finalAmount: number;
  subsidyEstimate: number;
  effectiveInvestment: number;
  money: (value: number) => string;
  gstSplitNote: string;
};

export function drawPricingCard(ctx: ProposalLayoutContext, data: PricingData, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const pad = 14;
  const innerW = CONTENT_WIDTH - pad * 2;
  const subsidyNote = formatCommercialOfferSubsidyNote(
    data.money(data.subsidyEstimate),
    data.money(data.effectiveInvestment),
  );

  doc.font(fonts.regular).fontSize(8);
  const noteH =
    doc.heightOfString(subsidyNote, { width: innerW }) +
    doc.heightOfString(data.gstSplitNote, { width: innerW }) +
    6;
  const cardH = 82 + noteH - mmToPt(3);

  const y = ensurePageSpace(doc, top, cardH, pageBottom);
  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH, 10, "#FFFFFF");

  const labelX = CONTENT_LEFT + pad;
  let rowY = y + pad;

  const rows: Array<[string, string, "normal" | "green" | "highlight"]> = [
    ["Gross Project Cost Payable", data.money(data.finalAmount), "highlight"],
    ["Central Government Subsidy", data.money(data.subsidyEstimate), "green"],
  ];

  rows.forEach(([label, value, style], index) => {
    const isHighlight = style === "highlight";
    const rowBoxH = isHighlight ? 32 : 18;
    if (isHighlight) {
      doc.roundedRect(labelX - 4, rowY - 1, innerW + 8, rowBoxH, 6).fill(PREMIUM.accentSoft);
      doc.roundedRect(labelX - 4, rowY - 1, innerW + 8, rowBoxH, 6).lineWidth(1).strokeColor(palette.accent).stroke();
    }

    doc
      .font(isHighlight ? fonts.bold : fonts.regular)
      .fontSize(isHighlight ? 11 : 9.5)
      .fillColor(PREMIUM.heading)
      .text(label, labelX, rowY + (isHighlight ? 7 : 3), { width: innerW - 130 });

    const valueColor = style === "green" ? PREMIUM.positive : isHighlight ? palette.accent : palette.ink;
    doc
      .font(fonts.bold)
      .fontSize(isHighlight ? 16 : 10)
      .fillColor(valueColor)
      .text(value, labelX, rowY + (isHighlight ? 5 : 3), { width: innerW, align: "right" });

    const rowGap = index === 0 ? 4 : 2;
    rowY += rowBoxH + rowGap;
  });

  rowY += 2;
  doc.font(fonts.regular).fontSize(7.5).fillColor(palette.muted).text(subsidyNote, labelX, rowY, {
    width: innerW,
  });
  rowY = doc.y + 3;
  doc.text(data.gstSplitNote, labelX, rowY, { width: innerW });

  return y + cardH;
}

export function drawPremiumBomTable(
  ctx: ProposalLayoutContext,
  opts: { bom: BomLine[] },
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const left = CONTENT_LEFT;
  const tableW = CONTENT_WIDTH;
  const radius = 8;
  const hPad = 4;
  const fixedCols = [
    { key: "sr", label: "Sr.", w: 24 },
    { key: "item", label: "Item", w: 68 },
    { key: "qty", label: "Qty", w: 40 },
    { key: "cap", label: "Capacity", w: 56 },
    { key: "make", label: "Make", w: 44 },
  ] as const;
  const descW = tableW - hPad * 2 - fixedCols.reduce((sum, col) => sum + col.w, 0);
  const cols = [
    fixedCols[0],
    fixedCols[1],
    { key: "desc", label: "Description", w: descW },
    fixedCols[2],
    fixedCols[3],
    fixedCols[4],
  ] as const;

  const colX: Record<string, number> = {};
  let x = left + hPad;
  for (const col of cols) {
    colX[col.key] = x;
    x += col.w;
  }

  const headerH = 24;
  let y = ensurePageSpace(doc, top, headerH + 40, pageBottom);

  const tableTop = y;
  doc.roundedRect(left, y, tableW, 8, radius).fill(PREMIUM.heading);
  doc.rect(left, y + 4, tableW, headerH - 4).fill(PREMIUM.heading);

  doc.font(fonts.bold).fontSize(7.5).fillColor("#FFFFFF");
  for (const col of cols) {
    doc.text(col.label, colX[col.key] + CELL_PAD, y + 8, {
      width: col.w - CELL_PAD * 2,
      align: col.key === "sr" || col.key === "qty" || col.key === "cap" ? "center" : "left",
    });
  }

  y += headerH;
  const detailSpanW = cols.slice(2).reduce((sum, col) => sum + col.w, 0);

  const drawHeader = () => {
    doc.roundedRect(left, y - headerH, tableW, headerH, 0).fill(PREMIUM.heading);
    doc.font(fonts.bold).fontSize(7.5).fillColor("#FFFFFF");
    for (const col of cols) {
      doc.text(col.label, colX[col.key] + CELL_PAD, y - headerH + 8, {
        width: col.w - CELL_PAD * 2,
        align: col.key === "sr" || col.key === "qty" || col.key === "cap" ? "center" : "left",
      });
    }
  };

  const rowPadY = 6;
  const rowPadBottom = 6;
  const minRowH = 20;

  const measureTextBlockH = (
    text: string,
    width: number,
    font: string = fonts.regular,
    size = 7.5,
  ): number => {
    if (!text) return 0;
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, { width }) + rowPadY + rowPadBottom;
  };

  opts.bom.forEach((line, index) => {
    const itemCellW = cols[1].w - CELL_PAD * 2;
    const descCellW = line.spanDetailColumns ? detailSpanW - CELL_PAD * 2 : cols[2].w - CELL_PAD * 2;
    const qtyCellW = cols[3].w - CELL_PAD * 2;
    const capCellW = cols[4].w - 8;
    const makeCellW = cols[5].w - CELL_PAD * 2;

    doc.font(fonts.regular).fontSize(7.5);
    let rowH = minRowH;

    if (!line.isModuleVariant) {
      rowH = Math.max(rowH, measureTextBlockH(String(line.sr), cols[0].w - CELL_PAD * 2));
      rowH = Math.max(rowH, measureTextBlockH(line.item, itemCellW));
    }

    rowH = Math.max(rowH, measureTextBlockH(line.description, descCellW));

    if (!line.spanDetailColumns) {
      rowH = Math.max(rowH, measureTextBlockH(line.qty, qtyCellW, fonts.bold));
      rowH = Math.max(rowH, measureTextBlockH(line.make, makeCellW));

      doc.font(fonts.bold).fontSize(6.5);
      const capTextH = line.capacity
        ? doc.heightOfString(line.capacity, { width: capCellW })
        : 0;
      rowH = Math.max(rowH, Math.max(18, capTextH + rowPadY + rowPadBottom));
    }

    rowH = Math.ceil(rowH);

    if (y + rowH > pageBottom) {
      doc.addPage();
      y = MARGIN_TOP + headerH;
      drawHeader();
    }

    if (index % 2 === 1) {
      doc.rect(left + 1, y, tableW - 2, rowH).fill(palette.zebra);
    }

    doc.font(fonts.regular).fontSize(7.5).fillColor(palette.ink);
    if (!line.isModuleVariant) {
      doc.text(String(line.sr), colX.sr + CELL_PAD, y + 6, { width: cols[0].w - CELL_PAD * 2, align: "center" });
      doc.text(line.item, colX.item + CELL_PAD, y + 6, { width: cols[1].w - CELL_PAD * 2 });
    }

    if (line.spanDetailColumns) {
      doc.text(line.description, colX.desc + CELL_PAD, y + 6, { width: detailSpanW - CELL_PAD * 2 });
    } else {
      doc.text(line.description, colX.desc + CELL_PAD, y + 6, { width: cols[2].w - CELL_PAD * 2 });
      doc
        .font(fonts.bold)
        .fillColor(PREMIUM.heading)
        .text(line.qty, colX.qty + CELL_PAD, y + 6, { width: cols[3].w - CELL_PAD * 2, align: "center" });
      doc.font(fonts.regular).fillColor(palette.ink);

      doc.font(fonts.bold).fontSize(6.5);
      const capTextH = line.capacity
        ? doc.heightOfString(line.capacity, { width: capCellW })
        : 0;
      const pillW = capCellW;
      const pillH = Math.max(14, capTextH + 4);
      const pillX = colX.cap + (cols[4].w - pillW) / 2;
      const pillY = y + (rowH - pillH) / 2;
      doc.roundedRect(pillX, pillY, pillW, pillH, 7).fill(PREMIUM.accentSoft);
      doc
        .fillColor(palette.accent)
        .text(line.capacity, pillX, pillY + (pillH - capTextH) / 2, { width: pillW, align: "center" });

      doc.font(fonts.regular).fontSize(7.5).fillColor(palette.ink);
      doc.text(line.make, colX.make + CELL_PAD, y + 6, { width: cols[5].w - CELL_PAD * 2, align: "center" });
    }

    y += rowH;
    doc
      .moveTo(left + 4, y)
      .lineTo(left + tableW - 4, y)
      .lineWidth(0.25)
      .strokeColor(palette.border)
      .stroke();
  });

  const tableBottom = y + 4;
  doc.roundedRect(left, tableTop, tableW, tableBottom - tableTop, radius).lineWidth(0.75).strokeColor(palette.border).stroke();

  return tableBottom;
}

function drawChecklist(
  ctx: DocContext,
  items: string[],
  x: number,
  y: number,
  width: number,
  icon: string,
  iconColor: string,
): number {
  const { doc, palette, fonts } = ctx;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  for (const item of items) {
    doc.font(fonts.bold).fontSize(9).fillColor(iconColor).text(icon, x, y, { width: 12 });
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(item, x + 14, y, { width: width - 16 });
    y = doc.y + 4;
  }
  return y;
}

export function drawScopeCards(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const gap = 12;
  const cardW = (CONTENT_WIDTH - gap) / 2;
  const pad = 12;
  const innerW = cardW - pad * 2;
  const scopeTop = top + mmToPt(4);

  doc.font(fonts.regular).fontSize(8.5);
  const ivaanH =
    36 +
    IVAAN_SCOPE_ITEMS.reduce((h, item) => h + doc.heightOfString(item, { width: innerW - 16 }) + 4, 0);
  const clientH =
    36 +
    CLIENT_SCOPE_ITEMS.reduce((h, item) => h + doc.heightOfString(item, { width: innerW - 16 }) + 4, 0);
  const cardH = Math.max(ivaanH, clientH);

  const y = ensurePageSpace(doc, scopeTop, cardH, pageBottom);

  drawCard(ctx, CONTENT_LEFT, y, cardW, cardH, 8, "#FFFFFF");
  drawCard(ctx, CONTENT_LEFT + cardW + gap, y, cardW, cardH, 8, PREMIUM.cardBg);

  doc
    .font(fonts.bold)
    .fontSize(9)
    .fillColor(PREMIUM.heading)
    .text("Scope of Ivaan Solar Energy", CONTENT_LEFT + pad, y + pad, { width: innerW });
  drawChecklist(
    ctx,
    IVAAN_SCOPE_ITEMS,
    CONTENT_LEFT + pad,
    y + pad + 18,
    innerW,
    PREMIUM.checkIcon,
    PREMIUM.positive,
  );

  doc
    .font(fonts.bold)
    .fontSize(9)
    .fillColor(PREMIUM.heading)
    .text("Client Scope", CONTENT_LEFT + cardW + gap + pad, y + pad, { width: innerW });
  drawChecklist(
    ctx,
    CLIENT_SCOPE_ITEMS,
    CONTENT_LEFT + cardW + gap + pad,
    y + pad + 18,
    innerW,
    PREMIUM.alertIcon,
    palette.accent,
  );

  return y + cardH;
}

export function drawGenerationKpiCards(
  ctx: ProposalLayoutContext,
  metrics: KpiCard[],
  top: number,
  options: KpiGridOptions = {},
): number {
  return drawKpiGrid(ctx, metrics, top, 4, { bottomGapPt: 12, ...options });
}

export type GenerationEstimateSectionData = {
  metrics: KpiCard[];
  disclaimer: string;
  monthlyRows: Array<{ month: string; acEnergyKwh: number }>;
  monthlyAverageKwh: number;
};

function drawBarChartInBounds(
  ctx: ProposalLayoutContext,
  rows: Array<{ month: string; acEnergyKwh: number }>,
  monthlyAverageKwh: number,
  x: number,
  y: number,
  width: number,
  chartHeight: number,
): number {
  const { doc, palette, fonts } = ctx;
  const totalHeight = getGenerationChartCardHeight(chartHeight);
  const cardPad = GENERATION_CHART_CARD_PAD;
  const titleChartGap = GENERATION_CHART_TITLE_GAP;

  drawCard(ctx, x, y, width, totalHeight, 8, "#FFFFFF");

  const cy = y + cardPad;
  doc
    .font(fonts.bold)
    .fontSize(7.5)
    .fillColor(PREMIUM.heading)
    .text("Monthly Est. AC Generation (kWh) — Jalgaon, Maharashtra", x + cardPad, cy, {
      width: width - cardPad * 2,
    });

  const values = rows.map((row) => row.acEnergyKwh);
  const maxValue = Math.max(...values);
  const yAxisWidth = 26;
  const chartLeft = x + cardPad + yAxisWidth;
  const chartWidth = width - cardPad * 2 - yAxisWidth;
  const barGap = 3;
  const barWidth = (chartWidth - barGap * (rows.length + 1)) / rows.length;
  const chartTop = doc.y + titleChartGap;
  const baseline = chartTop + chartHeight;

  doc.font(fonts.regular).fontSize(6).text("0", x + cardPad, baseline - 7, { width: yAxisWidth - 4, align: "right" });

  doc
    .moveTo(chartLeft, baseline)
    .lineTo(chartLeft + chartWidth, baseline)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();

  const averageLineY =
    maxValue > 0 ? baseline - (monthlyAverageKwh / maxValue) * chartHeight : baseline;

  rows.forEach((row, index) => {
    const barX = chartLeft + barGap + index * (barWidth + barGap);
    const barH = maxValue > 0 ? (row.acEnergyKwh / maxValue) * chartHeight : 0;
    const barY = baseline - barH;
    doc.roundedRect(barX, barY, barWidth, barH, 2).fill(palette.accent);
    doc
      .font(fonts.regular)
      .fontSize(6)
      .fillColor(palette.muted)
      .text(row.month.slice(0, 3), barX, baseline + 3, { width: barWidth, align: "center" });
  });

  if (maxValue > 0 && monthlyAverageKwh > 0) {
    doc
      .moveTo(chartLeft, averageLineY)
      .lineTo(chartLeft + chartWidth, averageLineY)
      .lineWidth(0.5)
      .dash(4, { space: 3 })
      .strokeColor(palette.faint)
      .stroke()
      .undash();

    doc
      .font(fonts.regular)
      .fontSize(5)
      .fillColor(palette.faint)
      .text("Monthly average generation", x + cardPad, averageLineY - 10, {
        width: yAxisWidth - 2,
        align: "right",
      });
  }

  return y + totalHeight;
}

export function drawGenerationEstimateSection(
  ctx: ProposalLayoutContext,
  data: GenerationEstimateSectionData,
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const colGap = 12;
  const leftW = Math.floor((CONTENT_WIDTH - colGap) * 0.4);
  const rightW = CONTENT_WIDTH - colGap - leftW;
  const leftX = CONTENT_LEFT;
  const rightX = CONTENT_LEFT + leftW + colGap;
  const chartHeight = GENERATION_CHART_HEIGHT_PT;
  const chartCardH = getGenerationChartCardHeight(chartHeight);

  doc.font(fonts.regular).fontSize(7);
  const disclaimerH = doc.heightOfString(data.disclaimer, { width: CONTENT_WIDTH });
  const sectionH = chartCardH + GENERATION_NOTE_GAP + disclaimerH;

  const y = ensurePageSpace(doc, top, sectionH, pageBottom);

  drawKpiGridInBounds(ctx, data.metrics, leftX, y, leftW, chartCardH, 2);
  drawBarChartInBounds(ctx, data.monthlyRows, data.monthlyAverageKwh, rightX, y, rightW, chartHeight);

  const noteY = y + chartCardH + GENERATION_NOTE_GAP;
  doc.font(fonts.regular).fontSize(7).fillColor(palette.muted).text(data.disclaimer, CONTENT_LEFT, noteY, {
    width: CONTENT_WIDTH,
  });

  return noteY + disclaimerH;
}

export function drawPremiumBarChart(
  ctx: ProposalLayoutContext,
  rows: Array<{ month: string; acEnergyKwh: number }>,
  monthlyAverageKwh: number,
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const chartHeight = 80;
  const labelHeight = 18;
  const titleChartGap = 10;
  const totalHeight = chartHeight + labelHeight + titleChartGap + 34;

  const cardTop = ensurePageSpace(doc, top, totalHeight, pageBottom);
  let y = cardTop;

  drawCard(ctx, CONTENT_LEFT, cardTop, CONTENT_WIDTH, totalHeight - 8, 8, "#FFFFFF");
  const cardPad = 12;
  y += cardPad;

  doc
    .font(fonts.bold)
    .fontSize(8)
    .fillColor(PREMIUM.heading)
    .text("Monthly Est. AC Generation (kWh) — Jalgaon, Maharashtra", CONTENT_LEFT + cardPad, y, {
      width: CONTENT_WIDTH - cardPad * 2,
    });

  const values = rows.map((row) => row.acEnergyKwh);
  const maxValue = Math.max(...values);
  const yAxisWidth = 36;
  const chartLeft = CONTENT_LEFT + cardPad + yAxisWidth;
  const chartWidth = CONTENT_WIDTH - cardPad * 2 - yAxisWidth;
  const barGap = 5;
  const barWidth = (chartWidth - barGap * (rows.length + 1)) / rows.length;
  const chartTop = doc.y + titleChartGap;
  const baseline = chartTop + chartHeight;

  doc.text("0", CONTENT_LEFT + cardPad, baseline - 8, { width: yAxisWidth - 4, align: "right" });

  doc
    .moveTo(chartLeft, baseline)
    .lineTo(chartLeft + chartWidth, baseline)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();

  const averageLineY =
    maxValue > 0 ? baseline - (monthlyAverageKwh / maxValue) * chartHeight : baseline;

  rows.forEach((row, index) => {
    const barX = chartLeft + barGap + index * (barWidth + barGap);
    const barH = maxValue > 0 ? (row.acEnergyKwh / maxValue) * chartHeight : 0;
    const barY = baseline - barH;
    doc.roundedRect(barX, barY, barWidth, barH, 2).fill(palette.accent);
    doc
      .font(fonts.regular)
      .fontSize(6.5)
      .fillColor(palette.muted)
      .text(row.month.slice(0, 3), barX, baseline + 4, { width: barWidth, align: "center" });
  });

  if (maxValue > 0 && monthlyAverageKwh > 0) {
    doc
      .moveTo(chartLeft, averageLineY)
      .lineTo(chartLeft + chartWidth, averageLineY)
      .lineWidth(0.5)
      .dash(4, { space: 3 })
      .strokeColor(palette.faint)
      .stroke()
      .undash();

    doc
      .font(fonts.regular)
      .fontSize(5.5)
      .fillColor(palette.faint)
      .text("Monthly average generation", CONTENT_LEFT + cardPad, averageLineY - 12, {
        width: yAxisWidth - 2,
        align: "right",
      });
  }

  return cardTop + totalHeight - 8;
}

export function drawImpactCards(
  ctx: ProposalLayoutContext,
  metrics: KpiCard[],
  top: number,
): number {
  return drawKpiGrid(ctx, metrics, top, 3);
}

export type GstBreakupData = {
  money: (value: number) => string;
  gst: {
    bucketAt5Percent: number;
    taxableAt5Percent: number;
    gstAt5Percent: number;
    bucketAt18Percent: number;
    taxableAt18Percent: number;
    gstAt18Percent: number;
    grandTotal: number;
    totalTaxable: number;
    totalGst: number;
  };
};

export function drawGstBreakupSection(ctx: ProposalLayoutContext, data: GstBreakupData, top: number): number {
  const { doc, palette, pageBottom } = ctx;
  const intro =
    `Final amount is GST inclusive. ${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% taxable at ${GST_SPLIT_LOW_RATE}% and ${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% taxable at ${GST_SPLIT_HIGH_RATE}%.`;

  doc.fontSize(8);
  const introH = doc.heightOfString(intro, { width: CONTENT_WIDTH }) + 60;
  let y = ensurePageSpace(doc, top, introH + 80, pageBottom);

  y = drawPremiumSectionTitle(ctx, "GST Breakup", CONTENT_LEFT, y);
  doc.fontSize(8).fillColor(palette.muted).text(intro, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 6;

  const gstColumns: TableColumn[] = [
    { key: "component", label: "Component", width: 170, align: "left", bold: true },
    { key: "inclusive", label: "GST Inclusive", width: 90, align: "right" },
    { key: "taxable", label: "Taxable Value", width: 90, align: "right" },
    { key: "gst", label: "GST Amount", width: 90, align: "right" },
    { key: "rate", label: "Rate", width: 55, align: "center" },
  ];
  const gstRows = [
    {
      component: `${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% Supply`,
      inclusive: data.money(data.gst.bucketAt5Percent),
      taxable: data.money(data.gst.taxableAt5Percent),
      gst: data.money(data.gst.gstAt5Percent),
      rate: `${GST_SPLIT_LOW_RATE}%`,
    },
    {
      component: `${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% Installation`,
      inclusive: data.money(data.gst.bucketAt18Percent),
      taxable: data.money(data.gst.taxableAt18Percent),
      gst: data.money(data.gst.gstAt18Percent),
      rate: `${GST_SPLIT_HIGH_RATE}%`,
    },
    {
      component: "Total",
      inclusive: data.money(data.gst.grandTotal),
      taxable: data.money(data.gst.totalTaxable),
      gst: data.money(data.gst.totalGst),
      rate: "—",
    },
  ];
  const gstTable = drawTable(ctx, { top: y, columns: gstColumns, rows: gstRows, pageBottom });
  return gstTable.y;
}

export type WarrantyCardsOptions = {
  /** Pin the warranty block to the bottom of the page (just above the footer). */
  anchorToPageBottom?: boolean;
};

export function drawWarrantyCards(
  ctx: ProposalLayoutContext,
  top: number,
  options?: WarrantyCardsOptions,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const gap = 10;
  const cardW = (CONTENT_WIDTH - gap * 2) / 3;
  const pad = 12;
  const innerW = cardW - pad * 2;
  doc.font(fonts.regular).fontSize(7);
  const detailsBlockH = Math.max(
    ...WARRANTY_ROWS.map(([, details]) => doc.heightOfString(details, { width: innerW })),
  );
  const cardH = pad + 16 + 20 + detailsBlockH + pad;
  const sectionH = measureWarrantySectionHeight(ctx);

  let y: number;
  if (options?.anchorToPageBottom) {
    const anchorY = pageBottom - sectionH;
    if (top + SECTION_GAP_BEFORE_PT > anchorY) {
      y = ensurePageSpace(doc, top, sectionH + SECTION_GAP_BEFORE_PT, pageBottom);
      y = drawPremiumSectionTitle(ctx, "Warranty", CONTENT_LEFT, y);
    } else {
      y = drawPremiumSectionTitle(ctx, "Warranty", CONTENT_LEFT, anchorY, CONTENT_WIDTH, false, {
        skipGapBefore: true,
      });
    }
  } else {
    y = ensurePageSpace(doc, top, sectionH + SECTION_GAP_BEFORE_PT, pageBottom);
    y = drawPremiumSectionTitle(ctx, "Warranty", CONTENT_LEFT, y);
  }

  WARRANTY_ROWS.forEach(([component, details], index) => {
    const x = CONTENT_LEFT + index * (cardW + gap);
    drawCard(ctx, x, y, cardW, cardH, 8, PREMIUM.cardBg);

    let durationLabel = "See details";
    if (component === "Solar Modules") durationLabel = "30 Years";
    else if (component === "Inverter") durationLabel = "8 Years";
    else if (component === "Other BOS Components") durationLabel = "1 Year";

    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor(PREMIUM.heading)
      .text(component, x + pad, y + pad, { width: cardW - pad * 2 });
    doc
      .font(fonts.bold)
      .fontSize(14)
      .fillColor(palette.accent)
      .text(durationLabel, x + pad, y + pad + 16, { width: cardW - pad * 2 });
    doc
      .font(fonts.regular)
      .fontSize(7)
      .fillColor(palette.muted)
      .text(details, x + pad, y + pad + 36, { width: cardW - pad * 2 });
  });

  y += cardH + 6;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.muted).text(WARRANTY_FOOTNOTE, CONTENT_LEFT, y, {
    width: CONTENT_WIDTH,
  });
  return doc.y;
}

export function drawPaymentTimeline(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const cardH = 88;
  let y = ensurePageSpace(doc, top, cardH + 20, pageBottom);
  y = drawPremiumSectionTitle(ctx, "Payment Schedule", CONTENT_LEFT, y);

  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH, 8, "#FFFFFF");
  const stepW = CONTENT_WIDTH / PAYMENT_MILESTONES.length;

  PAYMENT_MILESTONES.forEach(([milestone, detail], index) => {
    const x = CONTENT_LEFT + index * stepW + 10;
    const cx = CONTENT_LEFT + index * stepW + stepW / 2;

    doc.circle(cx, y + 22, 14).fill(palette.accent);
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor("#FFFFFF")
      .text(String(index + 1), cx - 4, y + 18, { width: 10, align: "center" });

    doc
      .font(fonts.bold)
      .fontSize(8.5)
      .fillColor(PREMIUM.heading)
      .text(milestone, x, y + 42, { width: stepW - 16, align: "center" });
    doc
      .font(fonts.regular)
      .fontSize(7)
      .fillColor(palette.muted)
      .text(detail, x, y + 56, { width: stepW - 16, align: "center" });

    if (index < PAYMENT_MILESTONES.length - 1) {
      const arrowX = CONTENT_LEFT + (index + 1) * stepW;
      doc
        .moveTo(arrowX - 8, y + 22)
        .lineTo(arrowX + 2, y + 22)
        .lineWidth(1)
        .strokeColor(palette.border)
        .stroke();
    }
  });

  return y + cardH;
}

const TIMELINE_ICON_ASSET_DIR = path.join(process.cwd(), "assets", "installation-timeline");
const TIMELINE_NODE_R = 14;
const TIMELINE_STEM_H = 6;
const TIMELINE_ROW_H = 72;
const TIMELINE_ROW_GAP = 28;
const TIMELINE_SECTION_PAD = 10;
const TIMELINE_FOOTER_GAP = 10;

function installationTimelineIconAsset(icon: InstallationTimelineIcon): Buffer | null {
  const file = INSTALLATION_TIMELINE_ICON_FILES[icon];
  if (!file) return null;
  return readAsset(path.join(TIMELINE_ICON_ASSET_DIR, file));
}

function estimateInstallationTimelineSectionHeight(): number {
  const headerH = 28;
  const rowsH = TIMELINE_ROW_H * 3 + TIMELINE_ROW_GAP * 2;
  const footerH = 24;
  return headerH + rowsH + TIMELINE_SECTION_PAD + TIMELINE_FOOTER_GAP + footerH;
}

function timelineRowCenters(stepCount: number): number[] {
  return computeMilestoneCenters(
    stepCount,
    CONTENT_WIDTH,
    0,
    INSTALLATION_TIMELINE_GRID_COLUMNS,
  ).map((x) => CONTENT_LEFT + x);
}

function drawTimelineSnakePath(ctx: DocContext, rowYs: number[]): void {
  const { doc } = ctx;
  const theme = INSTALLATION_TIMELINE_THEME;
  const row1 = timelineRowCenters(5);
  const row2 = timelineRowCenters(5);
  const row3 = timelineRowCenters(4);
  const rowDirections: Array<"ltr" | "rtl"> = ["ltr", "rtl", "ltr"];
  const bendRadius = 14;
  const bendOutset = computeBendOutset(CONTENT_WIDTH, 5, { paddingX: 0, bendRadius });

  const { pathD, arrow } = buildTimelineRoadmapPath(
    rowYs,
    [row1, row2, row3],
    rowDirections,
    bendRadius,
    { arrowExtension: 10, bendOutset },
  );

  doc.save();
  doc.lineWidth(2.25).strokeColor(theme.connector).lineCap("round").lineJoin("round");
  doc.path(pathD).stroke();
  doc.restore();

  // Directional flow arrows in every gap between consecutive nodes so the reader
  // can follow the process order along each row.
  const drawFlowArrow = (x: number, y: number, dir: 1 | -1) => {
    doc
      .moveTo(x - dir * 2.6, y - 3.2)
      .lineTo(x + dir * 3.6, y)
      .lineTo(x - dir * 2.6, y + 3.2)
      .closePath()
      .fill(theme.connector);
  };

  [row1, row2, row3].forEach((centers, rowIndex) => {
    const dir: 1 | -1 = rowDirections[rowIndex] === "ltr" ? 1 : -1;
    const y = rowYs[rowIndex] ?? 0;
    for (let i = 0; i < centers.length - 1; i += 1) {
      const midX = ((centers[i] ?? 0) + (centers[i + 1] ?? 0)) / 2;
      drawFlowArrow(midX, y, dir);
    }
  });

  if (arrow) {
    const tip = arrow.rotation === 0 ? 1 : arrow.rotation === 180 ? -1 : 0;
    const down = arrow.rotation === 90 ? 1 : 0;
    if (tip !== 0) {
      doc
        .moveTo(arrow.x, arrow.y - 2.5)
        .lineTo(arrow.x + tip * 6, arrow.y)
        .lineTo(arrow.x, arrow.y + 2.5)
        .closePath()
        .fill(theme.connector);
    } else if (down !== 0) {
      doc
        .moveTo(arrow.x - 2.5, arrow.y)
        .lineTo(arrow.x, arrow.y + down * 6)
        .lineTo(arrow.x + 2.5, arrow.y)
        .closePath()
        .fill(theme.connector);
    }
  }
}

function drawInstallationTimelineStepNode(
  ctx: DocContext,
  centerX: number,
  iconY: number,
  colW: number,
  step: InstallationTimelineStep,
): void {
  const { doc, fonts } = ctx;
  const theme = INSTALLATION_TIMELINE_THEME;
  const iconAsset = installationTimelineIconAsset(step.icon);

  doc.circle(centerX, iconY, TIMELINE_NODE_R).fill(theme.white);
  doc.circle(centerX, iconY, TIMELINE_NODE_R).lineWidth(1.5).strokeColor(theme.connector).stroke();

  if (iconAsset) {
    const innerSize = 14;
    doc.image(iconAsset, centerX - innerSize / 2, iconY - innerSize / 2, {
      fit: [innerSize, innerSize],
    });
  } else {
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(theme.connector)
      .text(INSTALLATION_TIMELINE_PDF_ICONS[step.icon], centerX - TIMELINE_NODE_R, iconY - 4, {
        width: TIMELINE_NODE_R * 2,
        align: "center",
      });
  }

  const stemTop = iconY + TIMELINE_NODE_R;
  doc
    .moveTo(centerX, stemTop)
    .lineTo(centerX, stemTop + TIMELINE_STEM_H)
    .lineWidth(1.5)
    .strokeColor(theme.connector)
    .stroke();

  const titleY = stemTop + TIMELINE_STEM_H + 4;
  doc
    .font(fonts.bold)
    .fontSize(7.5)
    .fillColor(theme.ink)
    .text(step.title, centerX - colW / 2 + 2, titleY, { width: colW - 4, align: "center", lineGap: 0.5 });

  const badgeH = 12;
  const badgeW = Math.min(colW - 4, step.duration && step.duration.startsWith("+") ? 66 : 54);
  const badgeX = centerX - badgeW / 2;
  const badgeY = titleY + 18;
  if (step.duration) {
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2).fill(theme.lightGrey);
    doc
      .font(fonts.regular)
      .fontSize(6)
      .fillColor(theme.muted)
      .text(step.duration, badgeX, badgeY + 3, { width: badgeW, align: "center", lineGap: 0 });
  }
}

function drawInstallationTimelineRow(
  ctx: DocContext,
  row: InstallationTimelineRow,
  y: number,
): number {
  const { steps, direction } = row;
  const stepCount = steps.length;
  const colW = CONTENT_WIDTH / INSTALLATION_TIMELINE_GRID_COLUMNS;
  const centers = timelineRowCenters(stepCount);
  const iconY = y + TIMELINE_NODE_R + 2;
  const orderedSteps = direction === "rtl" ? [...steps].reverse() : steps;

  orderedSteps.forEach((step, index) => {
    drawInstallationTimelineStepNode(ctx, centers[index] ?? CONTENT_LEFT, iconY, colW, step);
  });

  return y + TIMELINE_ROW_H;
}

export function drawInstallationTimeline(ctx: ProposalLayoutContext, top: number): number {
  const { doc, fonts, palette, pageBottom } = ctx;
  const theme = INSTALLATION_TIMELINE_THEME;
  const sectionH = estimateInstallationTimelineSectionHeight();
  let y = top + SECTION_GAP_BEFORE_PT;
  y = ensurePageSpace(doc, y, sectionH, pageBottom);

  doc.rect(CONTENT_LEFT, y + 1, 3, 16).fill(palette.accent);
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor(theme.heading)
    .text(`${INSTALLATION_TIMELINE_TITLE_LEAD.toUpperCase()} `, CONTENT_LEFT + 10, y, { continued: true });
  doc.fillColor(palette.accent).text(INSTALLATION_TIMELINE_TITLE_EMPHASIS.toUpperCase());
  y = doc.y + 8;
  y += TIMELINE_SECTION_PAD;

  const rowStartY = y;
  const rowYs: number[] = [];
  INSTALLATION_TIMELINE_ROWS.forEach((row, rowIndex) => {
    rowYs.push(rowStartY + rowIndex * (TIMELINE_ROW_H + TIMELINE_ROW_GAP) + TIMELINE_NODE_R + 2);
  });
  drawTimelineSnakePath(ctx, rowYs);

  INSTALLATION_TIMELINE_ROWS.forEach((row, rowIndex) => {
    y = drawInstallationTimelineRow(
      ctx,
      row,
      rowStartY + rowIndex * (TIMELINE_ROW_H + TIMELINE_ROW_GAP),
    );
  });

  y += TIMELINE_FOOTER_GAP;
  doc
    .font(fonts.regular)
    .fontSize(7.5)
    .fillColor(theme.muted)
    .text(INSTALLATION_TIMELINE_FOOTER_NOTE, CONTENT_LEFT, y, { width: CONTENT_WIDTH, lineGap: 1.5 });

  return doc.y;
}

/** @deprecated Use drawInstallationTimeline */
export const drawDeliveryTimeline = drawInstallationTimeline;

export function drawWaareeBrandCard(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const pad = 14;
  const colW = (CONTENT_WIDTH - pad * 2 - 10) / 2;
  doc.font(fonts.regular).fontSize(8.5);
  const introH = WAAREE_INTRO.reduce((h, p) => h + doc.heightOfString(p, { width: CONTENT_WIDTH - pad * 2 }) + 4, 0);
  const cardH = 50 + Math.ceil(WAAREE_HIGHLIGHTS.length / 2) * 22 + introH + pad;

  let y = ensurePageSpace(doc, top, cardH, pageBottom);
  y = drawPremiumSectionTitle(ctx, "About Waaree", CONTENT_LEFT, y);

  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH - 20, 10, "#FFFFFF");
  const innerY = y + pad;

  doc
    .font(fonts.bold)
    .fontSize(12)
    .fillColor(PREMIUM.heading)
    .text("WAAREE Energies Ltd.", CONTENT_LEFT + pad, innerY, { width: CONTENT_WIDTH - pad * 2 });

  let hy = innerY + 20;
  WAAREE_HIGHLIGHTS.forEach((highlight, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const hx = CONTENT_LEFT + pad + col * (colW + 10);
    const hyPos = hy + row * 22;
    doc.font(fonts.bold).fontSize(8).fillColor(PREMIUM.positive).text(PREMIUM.checkIcon, hx, hyPos, { width: 10 });
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(highlight, hx + 12, hyPos, { width: colW - 12 });
  });

  hy = hy + Math.ceil(WAAREE_HIGHLIGHTS.length / 2) * 22 + 8;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.muted);
  for (const paragraph of WAAREE_INTRO) {
    doc.text(paragraph, CONTENT_LEFT + pad, hy, { width: CONTENT_WIDTH - pad * 2 });
    hy = doc.y + 4;
  }

  return y + cardH - 20;
}

export function drawTermsSection(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const colGap = 16;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const pad = 12;
  doc.font(fonts.regular).fontSize(8);

  const half = Math.ceil(PROPOSAL_TERMS.length / 2);
  const leftTerms = PROPOSAL_TERMS.slice(0, half);
  const rightTerms = PROPOSAL_TERMS.slice(half);

  const columnHeight = (terms: string[]) =>
    terms.reduce((h, t) => h + doc.heightOfString(t, { width: colW - 24 }) + 6, 0);
  const contentH = Math.max(columnHeight(leftTerms), columnHeight(rightTerms)) + pad * 2;

  let y = ensurePageSpace(doc, top, contentH + 20, pageBottom);
  y = drawPremiumSectionTitle(ctx, "Terms & Conditions", CONTENT_LEFT, y);

  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, contentH, 8, PREMIUM.cardBg);

  const renderColumn = (terms: string[], x: number, startY: number) => {
    let ty = startY;
    terms.forEach((term, index) => {
      const globalIndex = terms === leftTerms ? index : half + index;
      const isImportant = term === CANCELLATION_POLICY;
      doc
        .font(fonts.bold)
        .fontSize(8)
        .fillColor(isImportant ? palette.accent : palette.muted)
        .text(`${globalIndex + 1}.`, x, ty, { width: 14 });
      doc
        .font(isImportant ? fonts.bold : fonts.regular)
        .fontSize(8)
        .fillColor(isImportant ? PREMIUM.heading : palette.ink)
        .text(term, x + 16, ty, { width: colW - 24 });
      ty = doc.y + 4;
    });
  };

  const startY = y + pad;
  renderColumn(leftTerms, CONTENT_LEFT + pad, startY);
  renderColumn(rightTerms, CONTENT_LEFT + colW + colGap + pad, startY);

  return y + contentH;
}

export function drawBankDetailsCard(
  ctx: ProposalLayoutContext,
  bankDetails: string,
  companyName: string,
  top: number,
  qr?: Buffer | null,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const pad = 12;
  const leftW = CONTENT_WIDTH * 0.62;
  const rightW = CONTENT_WIDTH - leftW - 12;
  const qrSize = 78;
  const signatureH = 68;
  const cardGap = 12;

  // Card height hugs its content: the bank details text or the QR, whichever is
  // taller (no empty filler space).
  doc.font(fonts.regular).fontSize(9);
  const textH = doc.heightOfString(bankDetails, { width: leftW - pad * 2 });
  const cardH = Math.max(textH + pad * 2, qrSize + pad);

  // Reserve title + card + gap + signature as one unit so the block never splits
  // across pages (the section title decides the page break before drawing).
  let y = drawPremiumSectionTitle(ctx, "Bank Details", CONTENT_LEFT, top, CONTENT_WIDTH, false, {
    pageBottom,
    minFollowingHeight: cardH + cardGap + signatureH,
  });

  drawCard(ctx, CONTENT_LEFT, y, leftW, cardH, 8, "#FFFFFF");
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(palette.ink)
    .text(bankDetails, CONTENT_LEFT + pad, y + pad, { width: leftW - pad * 2 });

  const qrX = CONTENT_LEFT + leftW + 12;
  // QR sits bare (no background tile), centered in the right column and
  // vertically against the bank details card.
  const qrBoxX = qrX + (rightW - qrSize) / 2;
  const qrBoxY = y + (cardH - qrSize) / 2;
  if (qr) {
    doc.image(qr, qrBoxX, qrBoxY, { fit: [qrSize, qrSize], align: "center", valign: "center" });
  } else {
    doc
      .roundedRect(qrBoxX, qrBoxY, qrSize, qrSize, 4)
      .lineWidth(0.5)
      .dash(3, { space: 3 })
      .strokeColor(palette.border)
      .stroke()
      .undash();
  }

  y += cardH + cardGap;
  return drawSignatureBlock(ctx, companyName, y, 9, true);
}

export function drawSignatureBlock(
  ctx: DocContext,
  companyName: string,
  top: number,
  fontSize = 9,
  showCompanyStamp = true,
  pageBottom?: number,
): number {
  const { doc, palette, fonts } = ctx;
  const signW = 200;
  const signX = CONTENT_RIGHT - signW;
  const blockHeight = showCompanyStamp ? 68 : 54;
  const drawTop = pageBottom != null ? ensurePageSpace(doc, top, blockHeight, pageBottom) : top;

  doc
    .moveTo(signX, drawTop)
    .lineTo(CONTENT_RIGHT, drawTop)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();

  doc
    .font(fonts.regular)
    .fontSize(fontSize)
    .fillColor(palette.muted)
    .text(`For ${companyName}`, signX, drawTop + 8, { width: signW, align: "right" });
  doc
    .font(fonts.bold)
    .fontSize(fontSize)
    .fillColor(palette.ink)
    .text("Authorised Signatory", signX, drawTop + 38, { width: signW, align: "right" });

  if (showCompanyStamp) {
    doc
      .font(fonts.regular)
      .fontSize(fontSize - 2)
      .fillColor(palette.faint)
      .text("Company Stamp", signX, drawTop + 52, { width: signW, align: "right" });
  }

  return drawTop + blockHeight;
}
