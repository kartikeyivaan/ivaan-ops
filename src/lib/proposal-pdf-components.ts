import type { BomLine } from "@/lib/proposal-bom";
import {
  CLIENT_SCOPE_ITEMS,
  CANCELLATION_POLICY,
  DELIVERY_PROCESS_STEPS,
  DELIVERY_TIMELINE,
  IVAAN_SCOPE_ITEMS,
  PAYMENT_MILESTONES,
  PROPOSAL_TERMS,
  SUBSIDY_NOTE,
  WAAREE_FRANCHISEE_TAGLINE,
  WAAREE_HIGHLIGHTS,
  WAAREE_INTRO,
  WARRANTY_FOOTNOTE,
  WARRANTY_ROWS,
} from "@/lib/proposal-pdf-content";
import {
  CELL_PAD,
  companyLogo,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  drawTable,
  MARGIN_TOP,
  type DocContext,
  type TableColumn,
  waareeLogo,
} from "@/lib/pdf-theme";
import { formatDocumentDate } from "@/lib/utils";
import {
  GST_SPLIT_HIGH_RATE,
  GST_SPLIT_HIGH_WEIGHT,
  GST_SPLIT_LOW_RATE,
  GST_SPLIT_LOW_WEIGHT,
} from "@/lib/project-proposal-pricing";

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

export function drawPremiumSectionTitle(
  ctx: DocContext,
  text: string,
  x: number,
  y: number,
  width = CONTENT_WIDTH,
): number {
  const { doc, palette, fonts } = ctx;
  doc.rect(x, y + 1, 3, 16).fill(palette.accent);
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor(PREMIUM.heading)
    .text(text.toUpperCase(), x + 10, y, { width: width - 10 });
  const lineY = doc.y + 5;
  doc
    .moveTo(x, lineY)
    .lineTo(x + width, lineY)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();
  return lineY + 8;
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

  if (iseLogo) {
    doc.image(iseLogo, CONTENT_LEFT, top, { fit: [150, logoH] });
  } else {
    doc.font(fonts.bold).fontSize(14).fillColor(palette.ink).text(opts.companyName, CONTENT_LEFT, top);
  }

  if (waaree) {
    doc.image(waaree, CONTENT_RIGHT - 120, top, { fit: [110, logoH] });
  }

  const titleY = top + logoH + 10;
  doc
    .font(fonts.bold)
    .fontSize(17)
    .fillColor(PREMIUM.heading)
    .text(opts.title.toUpperCase(), CONTENT_LEFT, titleY, { width: CONTENT_WIDTH, align: "center" });

  doc
    .font(fonts.bold)
    .fontSize(8.5)
    .fillColor(palette.accent)
    .text(WAAREE_FRANCHISEE_TAGLINE, CONTENT_LEFT, doc.y + 3, {
      width: CONTENT_WIDTH,
      align: "center",
    });

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
  contentH += doc.heightOfString(subject, { width: innerW }) + 10;
  for (const p of paragraphs) {
    contentH += doc.heightOfString(p, { width: innerW }) + 6;
  }
  contentH += 30;
  const cardH = contentH + pad * 2;

  drawCard(ctx, CONTENT_LEFT, top, CONTENT_WIDTH, cardH, 8, "#FFFFFF");

  let y = top + pad;
  const x = CONTENT_LEFT + pad;
  doc.font(fonts.regular).fontSize(9).fillColor(palette.muted).text(formatDocumentDate(opts.proposalDate), x, y);
  y = doc.y + 8;

  doc.font(fonts.bold).fontSize(11).fillColor(PREMIUM.heading).text(`Dear ${opts.customerName},`, x, y);
  y = doc.y + 8;

  doc.font(fonts.bold).fontSize(9).fillColor(palette.accent).text(`Subject: ${subject}`, x, y, { width: innerW });
  y = doc.y + 10;

  doc.font(fonts.regular).fontSize(9.5).fillColor(palette.ink);
  for (const paragraph of paragraphs) {
    doc.text(paragraph, x, y, { width: innerW });
    y = doc.y + 6;
  }

  doc.text("Thanking you,", x, y);
  y = doc.y + 4;
  doc.font(fonts.bold).text(`For ${opts.companyName}`, x, y);

  return top + cardH + 8;
}

export type KpiCard = { label: string; value: string };

export function drawKpiGrid(
  ctx: ProposalLayoutContext,
  cards: KpiCard[],
  top: number,
  columns = 3,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const gap = 10;
  const cardW = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardH = 52;
  const rows = Math.ceil(cards.length / columns);
  const gridH = rows * cardH + (rows - 1) * gap;

  const y = ensurePageSpace(doc, top, gridH, pageBottom);

  cards.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = CONTENT_LEFT + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    drawCard(ctx, x, cy, cardW, cardH, 6, PREMIUM.cardBg);
    doc.circle(x + 14, cy + 16, 3).fill(palette.accent);
    doc.font(fonts.regular).fontSize(7).fillColor(palette.muted).text(card.label.toUpperCase(), x + 10, cy + 24, {
      width: cardW - 20,
    });
    doc.font(fonts.bold).fontSize(10).fillColor(PREMIUM.heading).text(card.value, x + 10, cy + 36, {
      width: cardW - 20,
    });
  });

  return y + gridH + 8;
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

  return y + cardH + 10;
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
  const pad = 16;
  const innerW = CONTENT_WIDTH - pad * 2;

  doc.font(fonts.regular).fontSize(8);
  const noteH =
    doc.heightOfString(SUBSIDY_NOTE, { width: innerW }) +
    doc.heightOfString(data.gstSplitNote, { width: innerW }) +
    12;
  const cardH = 130 + noteH;

  const y = ensurePageSpace(doc, top, cardH, pageBottom);
  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH, 10, "#FFFFFF");

  const labelX = CONTENT_LEFT + pad;
  let rowY = y + pad;

  const rows: Array<[string, string, "normal" | "green" | "highlight"]> = [
    ["Gross Project Cost Payable", data.money(data.finalAmount), "normal"],
    ["Central Government Subsidy", data.money(data.subsidyEstimate), "green"],
    ["Net Effective Investment", data.money(data.effectiveInvestment), "highlight"],
  ];

  for (const [label, value, style] of rows) {
    const isHighlight = style === "highlight";
    const rowBoxH = isHighlight ? 36 : 22;
    if (isHighlight) {
      doc.roundedRect(labelX - 4, rowY - 2, innerW + 8, rowBoxH, 6).fill(PREMIUM.accentSoft);
      doc.roundedRect(labelX - 4, rowY - 2, innerW + 8, rowBoxH, 6).lineWidth(1).strokeColor(palette.accent).stroke();
    }

    doc
      .font(isHighlight ? fonts.bold : fonts.regular)
      .fontSize(isHighlight ? 11 : 9.5)
      .fillColor(PREMIUM.heading)
      .text(label, labelX, rowY + (isHighlight ? 8 : 4), { width: innerW - 130 });

    const valueColor = style === "green" ? PREMIUM.positive : isHighlight ? palette.accent : palette.ink;
    doc
      .font(fonts.bold)
      .fontSize(isHighlight ? 16 : 10)
      .fillColor(valueColor)
      .text(value, labelX, rowY + (isHighlight ? 6 : 4), { width: innerW, align: "right" });

    rowY += rowBoxH + 6;
  }

  rowY += 4;
  doc.font(fonts.regular).fontSize(7.5).fillColor(palette.muted).text(SUBSIDY_NOTE, labelX, rowY, {
    width: innerW,
  });
  rowY = doc.y + 6;
  doc.text(data.gstSplitNote, labelX, rowY, { width: innerW });

  return y + cardH + 12;
}

export function drawPremiumBomTable(
  ctx: ProposalLayoutContext,
  opts: { bom: BomLine[]; companyName: string },
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const left = CONTENT_LEFT;
  const scopeW = 48;
  const tableW = CONTENT_WIDTH - scopeW;
  const radius = 8;
  const cols = [
    { key: "sr", label: "Sr.", w: 24 },
    { key: "item", label: "Item", w: 68 },
    { key: "desc", label: "Description", w: 162 },
    { key: "qty", label: "Qty", w: 40 },
    { key: "cap", label: "Capacity", w: 56 },
    { key: "make", label: "Make", w: 44 },
  ] as const;

  const colX: Record<string, number> = {};
  let x = left + 4;
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

  opts.bom.forEach((line, index) => {
    let rowH = 20;
    const descW = line.spanDetailColumns ? detailSpanW - CELL_PAD * 2 : cols[2].w - CELL_PAD * 2;
    const descH = doc.heightOfString(line.description, { width: descW }) + 10;
    if (descH > rowH) rowH = descH;

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

      const capW = cols[4].w - 8;
      const capTextW = doc.widthOfString(line.capacity);
      const pillW = Math.min(capW, capTextW + 10);
      const pillX = colX.cap + (cols[4].w - pillW) / 2;
      doc.roundedRect(pillX, y + 4, pillW, 14, 7).fill(PREMIUM.accentSoft);
      doc
        .font(fonts.bold)
        .fontSize(6.5)
        .fillColor(palette.accent)
        .text(line.capacity, pillX, y + 7, { width: pillW, align: "center" });

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

  const scopeX = left + tableW;
  doc.roundedRect(scopeX, tableTop, scopeW, tableBottom - tableTop, 4).fill(PREMIUM.cardBg);
  doc.roundedRect(scopeX, tableTop, scopeW, tableBottom - tableTop, 4).lineWidth(0.5).strokeColor(palette.border).stroke();
  doc.save();
  doc.font(fonts.bold).fontSize(7.5).fillColor(palette.accent);
  const scopeText = opts.companyName.toUpperCase();
  doc.translate(scopeX + scopeW / 2, tableTop + (tableBottom - tableTop) / 2);
  doc.rotate(-90);
  doc.text(scopeText, -((tableBottom - tableTop) / 2) + 10, -4, {
    width: tableBottom - tableTop - 20,
    align: "center",
  });
  doc.restore();

  return tableBottom + 8;
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

  doc.font(fonts.regular).fontSize(8.5);
  const ivaanH =
    36 +
    IVAAN_SCOPE_ITEMS.reduce((h, item) => h + doc.heightOfString(item, { width: innerW - 16 }) + 4, 0);
  const clientH =
    36 +
    CLIENT_SCOPE_ITEMS.reduce((h, item) => h + doc.heightOfString(item, { width: innerW - 16 }) + 4, 0);
  const cardH = Math.max(ivaanH, clientH);

  const y = ensurePageSpace(doc, top, cardH, pageBottom);

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

  return y + cardH + 12;
}

export function drawGenerationKpiCards(
  ctx: ProposalLayoutContext,
  metrics: KpiCard[],
  top: number,
): number {
  return drawKpiGrid(ctx, metrics, top, 4);
}

export function drawPremiumBarChart(
  ctx: ProposalLayoutContext,
  rows: Array<{ month: string; acEnergyKwh: number }>,
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const chartHeight = 80;
  const labelHeight = 18;
  const captionHeight = 14;
  const totalHeight = chartHeight + labelHeight + captionHeight + 20;

  let y = ensurePageSpace(doc, top, totalHeight, pageBottom);

  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, totalHeight - 8, 8, "#FFFFFF");
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
  const chartTop = y + captionHeight;
  const baseline = chartTop + chartHeight;

  doc
    .font(fonts.regular)
    .fontSize(6.5)
    .fillColor(palette.faint)
    .text(maxValue.toLocaleString("en-IN"), CONTENT_LEFT + cardPad, chartTop + 2, {
      width: yAxisWidth - 4,
      align: "right",
    });
  doc.text("0", CONTENT_LEFT + cardPad, baseline - 8, { width: yAxisWidth - 4, align: "right" });

  doc
    .moveTo(chartLeft, baseline)
    .lineTo(chartLeft + chartWidth, baseline)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();

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

  return y + totalHeight;
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
  return gstTable.y + 10;
}

export function drawWarrantyCards(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const gap = 10;
  const cardW = (CONTENT_WIDTH - gap * 2) / 3;
  const pad = 12;
  const cardH = 72;

  let y = ensurePageSpace(doc, top, cardH + 30, pageBottom);
  y = drawPremiumSectionTitle(ctx, "Warranty", CONTENT_LEFT, y);

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
  return doc.y + 10;
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

  return y + cardH + 12;
}

export function drawDeliveryTimeline(ctx: ProposalLayoutContext, top: number): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const stepCount = DELIVERY_PROCESS_STEPS.length;
  const cardH = 70;
  const notesH = DELIVERY_TIMELINE.length * 14 + 20;
  let y = ensurePageSpace(doc, top, cardH + notesH + 30, pageBottom);
  y = drawPremiumSectionTitle(ctx, "Delivery Timeline", CONTENT_LEFT, y);

  drawCard(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, cardH, 8, PREMIUM.cardBg);
  const stepW = CONTENT_WIDTH / stepCount;

  DELIVERY_PROCESS_STEPS.forEach((step, index) => {
    const cx = CONTENT_LEFT + index * stepW + stepW / 2;
    doc.circle(cx, y + 20, 5).fill(palette.accent);
    doc
      .font(fonts.regular)
      .fontSize(6)
      .fillColor(PREMIUM.heading)
      .text(step, cx - stepW / 2 + 4, y + 30, { width: stepW - 8, align: "center" });

    if (index < stepCount - 1) {
      const lineX = CONTENT_LEFT + (index + 1) * stepW;
      doc
        .moveTo(lineX - stepW / 2 + 8, y + 20)
        .lineTo(lineX - 4, y + 20)
        .lineWidth(0.75)
        .strokeColor(palette.accent)
        .stroke();
    }
  });

  y += cardH + 8;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.ink);
  for (const line of DELIVERY_TIMELINE) {
    doc.text(`• ${line}`, CONTENT_LEFT + 8, y, { width: CONTENT_WIDTH - 16 });
    y = doc.y + 3;
  }

  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(`Cancellation: ${CANCELLATION_POLICY}`, CONTENT_LEFT, y, {
    width: CONTENT_WIDTH,
  });
  return doc.y + 10;
}

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

  return y + cardH - 8;
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

  return y + contentH + 12;
}

export function drawBankDetailsCard(
  ctx: ProposalLayoutContext,
  bankDetails: string,
  companyName: string,
  top: number,
): number {
  const { doc, palette, fonts, pageBottom } = ctx;
  const pad = 16;
  const leftW = CONTENT_WIDTH * 0.62;
  const rightW = CONTENT_WIDTH - leftW - 12;
  const cardH = 110;

  let y = ensurePageSpace(doc, top, cardH + 60, pageBottom);
  y = drawPremiumSectionTitle(ctx, "Bank Details", CONTENT_LEFT, y);

  drawCard(ctx, CONTENT_LEFT, y, leftW, cardH, 8, "#FFFFFF");
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(palette.ink)
    .text(bankDetails, CONTENT_LEFT + pad, y + pad, { width: leftW - pad * 2 });

  const qrX = CONTENT_LEFT + leftW + 12;
  drawCard(ctx, qrX, y, rightW, cardH, 8, PREMIUM.cardBg);
  doc
    .font(fonts.regular)
    .fontSize(7.5)
    .fillColor(palette.muted)
    .text("UPI / QR Code", qrX + 10, y + 20, { width: rightW - 20, align: "center" });
  doc
    .roundedRect(qrX + 20, y + 36, rightW - 40, rightW - 40, 4)
    .lineWidth(0.5)
    .dash(3, { space: 3 })
    .strokeColor(palette.border)
    .stroke();
  doc
    .font(fonts.regular)
    .fontSize(6.5)
    .fillColor(palette.faint)
    .text("Scan to pay", qrX + 10, y + cardH - 18, { width: rightW - 20, align: "center" });

  y += cardH + 16;
  return drawSignatureBlock(ctx, companyName, y);
}

export function drawSignatureBlock(
  ctx: DocContext,
  companyName: string,
  top: number,
  fontSize = 9,
): number {
  const { doc, palette, fonts } = ctx;
  const signW = 200;
  const signX = CONTENT_RIGHT - signW;

  doc
    .moveTo(signX, top)
    .lineTo(CONTENT_RIGHT, top)
    .lineWidth(0.5)
    .strokeColor(palette.border)
    .stroke();

  doc
    .font(fonts.regular)
    .fontSize(fontSize)
    .fillColor(palette.muted)
    .text(`For ${companyName}`, signX, top + 8, { width: signW, align: "right" });
  doc
    .font(fonts.bold)
    .fontSize(fontSize)
    .fillColor(palette.ink)
    .text("Authorised Signatory", signX, top + 38, { width: signW, align: "right" });

  doc
    .font(fonts.regular)
    .fontSize(fontSize - 2)
    .fillColor(palette.faint)
    .text("Company Stamp", signX, top + 52, { width: signW, align: "right" });

  return top + 68;
}
