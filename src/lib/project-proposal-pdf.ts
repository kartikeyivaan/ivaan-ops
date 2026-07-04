import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import {
  backCalculateGstForPdf,
  GST_SPLIT_HIGH_RATE,
  GST_SPLIT_HIGH_WEIGHT,
  GST_SPLIT_LOW_RATE,
  GST_SPLIT_LOW_WEIGHT,
} from "@/lib/project-proposal-pricing";
import { formatProposalDocumentNumber } from "@/lib/project-proposals";
import {
  buildProposalBom,
  calculateProposedSystemKwp,
  resolveInverterKw,
  totalProposedPanelCount,
  type BomLine,
} from "@/lib/proposal-bom";
import {
  calculateEnvironmentalImpact,
  calculateGenerationEstimate,
  calculateMonthlyGeneration,
} from "@/lib/proposal-generation";
import {
  CLIENT_SCOPE_ITEMS,
  CANCELLATION_POLICY,
  DELIVERY_TIMELINE,
  GENERATION_DISCLAIMER,
  IVAAN_SCOPE_ITEMS,
  PAYMENT_MILESTONES,
  PROPOSAL_TERMS,
  PROJECT_DOCUMENTS_PHONE,
  SUBSIDY_NOTE,
  WAAREE_FRANCHISEE_TAGLINE,
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
  createDocOptions,
  drawFooter,
  drawParties,
  drawProjectQuotationHeader,
  drawTable,
  makeMoney,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  resolvePalette,
  resolveProfile,
  sectionTitle,
  setupFonts,
  waareeLogo,
  type DocContext,
  type TableColumn,
} from "@/lib/pdf-theme";
import { formatDocumentDate } from "@/lib/utils";

export const projectProposalPdfInclude = {
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
      bankDetails: true,
      termsAndConditions: true,
    },
  },
  salesUser: { select: { id: true, name: true, email: true, mobile: true } },
  revisions: {
    include: {
      package: true,
      inverterUpgrade: true,
    },
    orderBy: { revisionNo: "asc" as const },
  },
} satisfies Prisma.ProjectProposalInclude;

export type ProjectProposalPdfRecord = Prisma.ProjectProposalGetPayload<{
  include: typeof projectProposalPdfInclude;
}>;

export type ProjectProposalPdfFormat = "full" | "card";

type RevisionRecord = ProjectProposalPdfRecord["revisions"][number];

type PreparedProposal = {
  proposal: ProjectProposalPdfRecord;
  revision: RevisionRecord;
  documentNo: string;
  systemKw: number;
  panelWp: number;
  panelCount: number;
  ndcrPanelWp: number;
  inverterBrand: string;
  inverterKw: number;
  finalAmount: number;
  subsidyEstimate: number;
  effectiveInvestment: number;
  gst: ReturnType<typeof backCalculateGstForPdf>;
  money: (value: number) => string;
  profile: ReturnType<typeof resolveProfile>;
  generation: ReturnType<typeof calculateGenerationEstimate>;
  environmental: ReturnType<typeof calculateEnvironmentalImpact>;
  monthlyRows: ReturnType<typeof calculateMonthlyGeneration>;
  bom: BomLine[];
};

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function structureLabel(value: string): string {
  const labels: Record<string, string> = {
    CUSTOM_FABRICATED: "Custom Fabricated Structure",
    PREFAB_C_CHANNEL: "Pre-fabricated C Channel",
    MONO_RAIL: "Mono Rail Structure",
  };
  return labels[value] ?? formatEnumLabel(value);
}

function connectionLabel(value: string): string {
  return value === "THREE_PHASE" ? "Three Phase" : "Single Phase";
}

function currentRevision(proposal: ProjectProposalPdfRecord): RevisionRecord | null {
  return (
    proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1] ??
    null
  );
}

function prepareProposal(proposal: ProjectProposalPdfRecord, money: (v: number) => string): PreparedProposal {
  const revision = currentRevision(proposal);
  if (!revision) {
    throw new Error("REVISION_NOT_FOUND");
  }

  const systemKw = decimalToNumber(revision.package.systemKw);
  const panelWp = revision.package.panelWp;
  const panelCount = revision.package.panelCount;
  const ndcrPanelWp = revision.ndcrPanelWp ?? 580;
  const brands = (revision.inverterBrands as string[]) ?? [];
  const inverterBrand = brands[0] ?? "—";
  const inverterKw = resolveInverterKw(
    systemKw,
    revision.inverterUpgrade ? decimalToNumber(revision.inverterUpgrade.upgradeKw) : null,
  );
  const finalAmount = decimalToNumber(revision.finalAmount);
  const subsidyEstimate = decimalToNumber(revision.subsidyEstimate);
  const effectiveInvestment = decimalToNumber(revision.effectiveCustomerInvestment);
  const generation = calculateGenerationEstimate(systemKw);
  const environmental = calculateEnvironmentalImpact(generation.annualGenerationKwh);
  const monthlyRows = calculateMonthlyGeneration(generation.annualGenerationKwh);

  return {
    proposal,
    revision,
    documentNo: formatProposalDocumentNumber(proposal.proposalNo, revision.revisionNo),
    systemKw,
    panelWp,
    panelCount,
    ndcrPanelWp,
    inverterBrand,
    inverterKw,
    finalAmount,
    subsidyEstimate,
    effectiveInvestment,
    gst: backCalculateGstForPdf(finalAmount),
    money,
    profile: resolveProfile(proposal.company),
    generation,
    environmental,
    monthlyRows,
    bom: buildProposalBom({
      panelWp,
      panelCount,
      systemKw,
      ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
      ndcrPanelWp,
      inverterBrand,
      inverterKw,
      connectionPhase: revision.connectionPhase,
      structureType: revision.structureType,
    }),
  };
}

function formatQuoteCardWarranty(): string {
  const lines = WARRANTY_ROWS.map(([component, details]) => `${component}: ${details}`);
  lines.push(WARRANTY_FOOTNOTE);
  lines.push("Net metering & liaisoning included.");
  return lines.join("\n");
}

function drawDualBrandHeader(
  ctx: DocContext,
  opts: {
    companyCode: string;
    companyName: string;
    title: string;
    meta: Array<[string, string]>;
    compact?: boolean;
  },
): number {
  const { doc, palette, fonts } = ctx;
  const top = MARGIN_TOP;
  const iseLogo = companyLogo(opts.companyCode);
  const waaree = waareeLogo();
  const logoH = opts.compact ? 42 : 48;

  if (iseLogo) {
    doc.image(iseLogo, CONTENT_LEFT, top, { fit: [150, logoH] });
  } else {
    doc.font(fonts.bold).fontSize(14).fillColor(palette.ink).text(opts.companyName, CONTENT_LEFT, top);
  }

  if (waaree) {
    doc.image(waaree, CONTENT_RIGHT - 120, top, { fit: [110, logoH] });
  }

  const titleY = top + logoH + (opts.compact ? 4 : 8);
  doc
    .font(fonts.bold)
    .fontSize(opts.compact ? 14 : 17)
    .fillColor(palette.primary)
    .text(opts.title.toUpperCase(), CONTENT_LEFT, titleY, { width: CONTENT_WIDTH, align: "center" });

  doc
    .font(fonts.bold)
    .fontSize(opts.compact ? 7.5 : 8.5)
    .fillColor(palette.accent)
    .text(WAAREE_FRANCHISEE_TAGLINE, CONTENT_LEFT, doc.y + 2, {
      width: CONTENT_WIDTH,
      align: "center",
    });

  let metaY = doc.y + (opts.compact ? 6 : 10);
  doc.fontSize(opts.compact ? 8 : 8.5);
  for (const [label, value] of opts.meta) {
    doc.font(fonts.regular).fillColor(palette.muted).text(label, CONTENT_LEFT, metaY, { width: 130 });
    doc.font(fonts.bold).fillColor(palette.ink).text(value, CONTENT_LEFT + 132, metaY, {
      width: CONTENT_WIDTH - 132,
    });
    metaY += opts.compact ? 12 : 13;
  }

  doc
    .moveTo(CONTENT_LEFT, metaY + 2)
    .lineTo(CONTENT_RIGHT, metaY + 2)
    .lineWidth(0.75)
    .strokeColor(palette.border)
    .stroke();

  return metaY + 8;
}

function drawCommercialBlock(
  ctx: DocContext,
  data: PreparedProposal,
  top: number,
  pageBottom: number,
  compact = false,
): number {
  const { doc, palette, fonts } = ctx;
  let y = top;

  y = sectionTitle(ctx, compact ? "Commercial Summary" : "Commercial Offer", CONTENT_LEFT, y) + 4;

  const boxPad = compact ? 10 : 10;
  const rowH = compact ? 18 : 18;
  const labelX = CONTENT_LEFT + boxPad;
  const valueW = 120;
  const rows: Array<[string, string, boolean]> = [
    ["Project Cost Payable (GST Inclusive)", data.money(data.finalAmount), true],
    ["Central Govt. Subsidy", data.money(data.subsidyEstimate), false],
    ["Net Effective Investment", data.money(data.effectiveInvestment), true],
  ];

  const noteHeight =
    doc.font(fonts.regular).fontSize(compact ? 8 : 7.5).heightOfString(SUBSIDY_NOTE, {
      width: CONTENT_WIDTH - boxPad * 2,
    }) + 4;
  const boxH = rowH * 3 + boxPad * 2 + noteHeight;

  if (y + boxH > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  }

  doc.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, boxH, 4).fill(palette.accentSoft);
  doc.roundedRect(CONTENT_LEFT, y, CONTENT_WIDTH, boxH, 4).lineWidth(0.75).strokeColor(palette.border).stroke();

  let rowY = y + boxPad;
  for (const [label, value, bold] of rows) {
    doc.font(bold ? fonts.bold : fonts.regular)
      .fontSize(compact ? 9.5 : 9.5)
      .fillColor(palette.ink)
      .text(label, labelX, rowY, { width: CONTENT_WIDTH - valueW - boxPad * 2 });
    doc.text(value, CONTENT_RIGHT - valueW - boxPad, rowY, { width: valueW, align: "right" });
    rowY += rowH;
  }

  rowY += 2;
  doc.font(fonts.regular).fontSize(compact ? 8 : 7.5).fillColor(palette.muted).text(SUBSIDY_NOTE, labelX, rowY, {
    width: CONTENT_WIDTH - boxPad * 2,
  });

  y = y + boxH + (compact ? 6 : 10);

  doc.font(fonts.regular).fontSize(compact ? 8 : 7.5).fillColor(palette.muted).text(
    `GST split: ${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% supply @ ${GST_SPLIT_LOW_RATE}% (${data.money(data.gst.bucketAt5Percent)}) · ${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% installation @ ${GST_SPLIT_HIGH_RATE}% (${data.money(data.gst.bucketAt18Percent)})`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );

  return doc.y + (compact ? 8 : 10);
}

function drawBulletList(
  ctx: DocContext,
  items: string[],
  x: number,
  y: number,
  width: number,
  fontSize = 8.5,
): number {
  const { doc, palette, fonts } = ctx;
  doc.font(fonts.regular).fontSize(fontSize).fillColor(palette.ink);
  for (const item of items) {
    doc.text("•", x, y, { width: 10 });
    doc.text(item, x + 10, y, { width: width - 10 });
    y = doc.y + 2;
  }
  return y;
}

function monthAbbrev(month: string): string {
  return month.slice(0, 3);
}

function drawMonthlyGenerationBarChart(
  ctx: DocContext,
  rows: PreparedProposal["monthlyRows"],
  top: number,
  pageBottom: number,
): number {
  const { doc, palette, fonts } = ctx;
  const chartHeight = 72;
  const labelHeight = 16;
  const captionHeight = 12;
  const totalHeight = chartHeight + labelHeight + captionHeight + 10;

  let y = top;
  if (y + totalHeight > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  }

  const values = rows.map((row) => row.acEnergyKwh);
  const maxValue = Math.max(...values);
  const yAxisWidth = 34;
  const chartLeft = CONTENT_LEFT + yAxisWidth;
  const chartWidth = CONTENT_WIDTH - yAxisWidth;
  const barGap = 4;
  const barWidth = (chartWidth - barGap * (rows.length + 1)) / rows.length;
  const chartTop = y + captionHeight;
  const baseline = chartTop + chartHeight;

  doc
    .font(fonts.regular)
    .fontSize(7.5)
    .fillColor(palette.muted)
    .text("Monthly Est. AC Generation (kWh) — Jalgaon, Maharashtra", CONTENT_LEFT, y, {
      width: CONTENT_WIDTH,
    });

  doc
    .font(fonts.regular)
    .fontSize(6.5)
    .fillColor(palette.faint)
    .text(maxValue.toLocaleString("en-IN"), CONTENT_LEFT, chartTop + 2, {
      width: yAxisWidth - 4,
      align: "right",
    });
  doc.text("0", CONTENT_LEFT, baseline - 8, { width: yAxisWidth - 4, align: "right" });

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
    doc.rect(barX, barY, barWidth, barH).fill(palette.accent);
    doc
      .font(fonts.regular)
      .fontSize(6.5)
      .fillColor(palette.muted)
      .text(monthAbbrev(row.month), barX, baseline + 3, { width: barWidth, align: "center" });
  });

  return baseline + labelHeight + 8;
}

function drawBomTable(ctx: DocContext, data: PreparedProposal, top: number, pageBottom: number): number {
  const { doc, palette, fonts } = ctx;
  const left = CONTENT_LEFT;
  const scopeW = 52;
  const tableW = CONTENT_WIDTH - scopeW;
  const cols = [
    { key: "sr", label: "Sr.", w: 22 },
    { key: "item", label: "Item", w: 72 },
    { key: "desc", label: "Description", w: 168 },
    { key: "qty", label: "Qty", w: 42 },
    { key: "cap", label: "Capacity", w: 58 },
    { key: "make", label: "Make", w: 46 },
  ] as const;

  const colX: Record<string, number> = {};
  let x = left;
  for (const col of cols) {
    colX[col.key] = x;
    x += col.w;
  }

  const headerH = 20;
  doc.rect(left, top, tableW, headerH).fill(palette.primary);
  doc.font(fonts.bold).fontSize(7.5).fillColor(palette.primaryText);
  for (const col of cols) {
    doc.text(col.label, colX[col.key] + CELL_PAD, top + 6, {
      width: col.w - CELL_PAD * 2,
      align: col.key === "sr" || col.key === "qty" || col.key === "cap" ? "center" : "left",
    });
  }

  let y = top + headerH;
  const detailSpanW = cols.slice(2).reduce((sum, col) => sum + col.w, 0);

  data.bom.forEach((line, index) => {
    let rowH = 18;
    const descW = line.spanDetailColumns ? detailSpanW - CELL_PAD * 2 : cols[2].w - CELL_PAD * 2;
    const descH = doc.heightOfString(line.description, { width: descW }) + 8;
    if (descH > rowH) rowH = descH;

    if (y + rowH > pageBottom) {
      doc.addPage();
      y = MARGIN_TOP;
      doc.rect(left, y, tableW, headerH).fill(palette.primary);
      doc.font(fonts.bold).fontSize(7.5).fillColor(palette.primaryText);
      for (const col of cols) {
        doc.text(col.label, colX[col.key] + CELL_PAD, y + 6, {
          width: col.w - CELL_PAD * 2,
          align: col.key === "sr" || col.key === "qty" || col.key === "cap" ? "center" : "left",
        });
      }
      y += headerH;
    }

    if (index % 2 === 1) {
      doc.rect(left, y, tableW, rowH).fill(palette.zebra);
    }

    doc.font(fonts.regular).fontSize(7.5).fillColor(palette.ink);
    if (!line.isModuleVariant) {
      doc.text(String(line.sr), colX.sr + CELL_PAD, y + 5, { width: cols[0].w - CELL_PAD * 2, align: "center" });
      doc.text(line.item, colX.item + CELL_PAD, y + 5, { width: cols[1].w - CELL_PAD * 2 });
    }

    if (line.spanDetailColumns) {
      doc.text(line.description, colX.desc + CELL_PAD, y + 5, { width: detailSpanW - CELL_PAD * 2 });
    } else {
      doc.text(line.description, colX.desc + CELL_PAD, y + 5, { width: cols[2].w - CELL_PAD * 2 });
      doc.text(line.qty, colX.qty + CELL_PAD, y + 5, { width: cols[3].w - CELL_PAD * 2, align: "center" });
      doc.text(line.capacity, colX.cap + CELL_PAD, y + 5, { width: cols[4].w - CELL_PAD * 2, align: "center" });
      doc.text(line.make, colX.make + CELL_PAD, y + 5, { width: cols[5].w - CELL_PAD * 2, align: "center" });
    }

    y += rowH;
    doc.moveTo(left, y).lineTo(left + tableW, y).lineWidth(0.5).strokeColor(palette.border).stroke();
  });

  const tableBottom = y;
  const tableTop = top;
  const scopeX = left + tableW;
  doc.rect(scopeX, tableTop, scopeW, tableBottom - tableTop).strokeColor(palette.border).stroke();
  doc.save();
  doc.font(fonts.bold).fontSize(8).fillColor(palette.ink);
  const scopeText = data.proposal.company.name.toUpperCase();
  doc.translate(scopeX + scopeW / 2, tableTop + (tableBottom - tableTop) / 2);
  doc.rotate(-90);
  doc.text(scopeText, -((tableBottom - tableTop) / 2) + 10, -4, {
    width: tableBottom - tableTop - 20,
    align: "center",
  });
  doc.restore();

  return tableBottom + 4;
}

function drawSignatureBlock(ctx: DocContext, companyName: string, top: number, fontSize = 9): number {
  const { doc, palette, fonts } = ctx;
  doc.font(fonts.regular).fontSize(fontSize).fillColor(palette.muted).text(`For ${companyName}`, CONTENT_RIGHT - 200, top, {
    width: 200,
    align: "right",
  });
  doc.font(fonts.bold).fontSize(fontSize).fillColor(palette.ink).text("Authorised Signatory", CONTENT_RIGHT - 200, top + 30, {
    width: 200,
    align: "right",
  });
  return top + 48;
}

function drawCoverLetter(ctx: DocContext, data: PreparedProposal, top: number): number {
  const { doc, palette, fonts } = ctx;
  let y = top;
  const { revision } = data;

  doc.font(fonts.regular).fontSize(9.5).fillColor(palette.ink);
  doc.text(formatDocumentDate(revision.proposalDate), CONTENT_LEFT, y);
  y = doc.y + 6;

  doc.font(fonts.bold).text(`Dear ${revision.customerName},`, CONTENT_LEFT, y);
  y = doc.y + 6;

  const subject = `Subject: Techno-Commercial Proposal for ${data.systemKw} kWp On-Grid Rooftop Solar (SRTPV) System.`;
  doc.font(fonts.bold).fontSize(9).text(subject, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 6;

  const paragraphs = [
    "With reference to our meeting and discussions, we are pleased to submit our offer for the above-mentioned on-grid solar rooftop system as per the scope defined herein.",
    "We trust this techno-commercial proposal meets your requirements. Please feel free to contact us for any further information.",
    "We look forward to a valuable association.",
  ];
  doc.font(fonts.regular).fontSize(9.5);
  for (const paragraph of paragraphs) {
    doc.text(paragraph, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 6;
  }

  doc.text("Thanking you,", CONTENT_LEFT, y);
  y = doc.y + 3;
  doc.font(fonts.bold).text(`For ${data.proposal.company.name}`, CONTENT_LEFT, y);

  return doc.y;
}

export async function generateProjectProposalQuoteCardPdf(
  proposal: ProjectProposalPdfRecord,
): Promise<Buffer> {
  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(proposal.company.code);
  const money = makeMoney(fonts.rupee);
  const ctx: DocContext = { doc, palette, fonts };
  const data = prepareProposal(proposal, money);
  const profile = resolveProfile(proposal.company);
  const pageBottom = doc.page.height - 56;
  const { revision } = data;

  const proposedKwp = calculateProposedSystemKwp({
    panelWp: data.panelWp,
    panelCount: data.panelCount,
    ndcrPanelWp: data.ndcrPanelWp,
    ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
    futureStructurePanels: revision.futureStructurePanels,
  });
  const totalPanels = totalProposedPanelCount({
    panelCount: data.panelCount,
    ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
    futureStructurePanels: revision.futureStructurePanels,
  });

  const headerBottom = drawProjectQuotationHeader(ctx, {
    logo: companyLogo(proposal.company.code),
    waareeLogo: waareeLogo(),
    companyName: proposal.company.name,
    title: "Project Quotation",
    profile,
    contactPhone: PROJECT_DOCUMENTS_PHONE,
    compact: true,
    meta: [
      ["Quotation #", data.documentNo],
      ["Date", formatDocumentDate(revision.proposalDate)],
      ["Valid Until", formatDocumentDate(revision.validityDate)],
    ],
  });

  let y = headerBottom + 6;

  const fromLines = proposal.salesUser.mobile
    ? [`Mob: ${proposal.salesUser.mobile}`]
    : [];

  const partiesBottom = drawParties(ctx, {
    top: y,
    skipTopRule: true,
    left: {
      label: "TO",
      name: revision.customerName,
      lines: [revision.shortAddress, `Mob: ${revision.customerMobile}`].filter(Boolean),
    },
    right: {
      label: "FROM",
      name: proposal.salesUser.name,
      lines: fromLines,
    },
  });

  y = partiesBottom + 6;
  y = sectionTitle(ctx, "System Summary", CONTENT_LEFT, y, undefined, 10) + 3;

  doc.font(fonts.bold).fontSize(10).fillColor(palette.ink).text(
    `${proposedKwp} kWp On-Grid Rooftop Solar System`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );
  y = doc.y + 5;

  const dcrLine = `DCR: Waaree ${data.panelWp}+Wp × ${data.panelCount}`;
  const ndcrLine =
    revision.ndcrAdditionalPanels > 0
      ? ` | NDCR: Waaree ${data.ndcrPanelWp}+Wp × ${revision.ndcrAdditionalPanels}`
      : "";
  const inverterLine = `Inverter: ${data.inverterBrand} ${data.inverterKw} kW | ${connectionLabel(revision.connectionPhase)} | ${structureLabel(revision.structureType)} Structure of ${totalPanels} Panels`;

  doc.font(fonts.regular).fontSize(9).fillColor(palette.ink);
  doc.text(`${dcrLine}${ndcrLine}`, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 3;
  doc.text(inverterLine, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 6;

  y = drawCommercialBlock(ctx, data, y, pageBottom, true);

  y += 4;
  y = sectionTitle(ctx, "Payment & Delivery", CONTENT_LEFT, y, undefined, 10) + 3;
  const colW = (CONTENT_WIDTH - 12) / 2;
  const colGap = 12;
  const rightColX = CONTENT_LEFT + colW + colGap;

  doc.font(fonts.bold).fontSize(9).fillColor(palette.faint).text("PAYMENT", CONTENT_LEFT, y);
  doc.text("DELIVERY", rightColX, y);
  y += 14;

  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  let payY = y;
  for (const [milestone, detail] of PAYMENT_MILESTONES) {
    doc.text(`${milestone}: ${detail}`, CONTENT_LEFT, payY, { width: colW });
    payY = doc.y + 4;
  }

  let delY = y;
  for (const line of DELIVERY_TIMELINE) {
    doc.text(line, rightColX, delY, { width: colW });
    delY = doc.y + 4;
  }
  y = Math.max(payY, delY) + 6;

  const infoTop = y;
  const warrantyText = formatQuoteCardWarranty();
  let warrantyY = sectionTitle(ctx, "Warranty", CONTENT_LEFT, infoTop, colW, 10) + 3;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(warrantyText, CONTENT_LEFT, warrantyY, {
    width: colW,
  });
  const warrantyBottom = doc.y;

  const bankDetails = proposal.company.bankDetails || profile.bankDetails;
  let bankBottom = infoTop;
  if (bankDetails) {
    let bankY = sectionTitle(ctx, "Bank Details", rightColX, infoTop, colW, 10) + 3;
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(bankDetails, rightColX, bankY, {
      width: colW,
    });
    bankBottom = doc.y;
  }

  y = Math.max(warrantyBottom, bankBottom) + 10;
  drawSignatureBlock(ctx, proposal.company.name, y, 10);

  const companyLine = [proposal.company.name, PROJECT_DOCUMENTS_PHONE, profile.email]
    .filter(Boolean)
    .join("  ||  ");
  drawFooter(ctx, companyLine);

  return collectPdfBuffer(doc);
}

export async function generateProjectProposalPdf(
  proposal: ProjectProposalPdfRecord,
): Promise<Buffer> {
  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(proposal.company.code);
  const money = makeMoney(fonts.rupee);
  const ctx: DocContext = { doc, palette, fonts };
  const data = prepareProposal(proposal, money);
  const pageBottom = doc.page.height - MARGIN_BOTTOM;

  // Page 1 — cover letter + project summary + BOM
  const headerBottom = drawDualBrandHeader(ctx, {
    companyCode: proposal.company.code,
    companyName: proposal.company.name,
    title: "Techno-Commercial Proposal",
    meta: [
      ["Proposal No.", data.documentNo],
      ["Date", formatDocumentDate(data.revision.proposalDate)],
      ["Valid Until", formatDocumentDate(data.revision.validityDate)],
    ],
  });

  let y = drawCoverLetter(ctx, data, headerBottom + 4);

  y += 4;
  y = sectionTitle(ctx, "Project Summary", CONTENT_LEFT, y) + 2;

  const summaryRows: Array<[string, string]> = [
    ["Plant Capacity", `${data.systemKw} kWp On-Grid Rooftop`],
    ["Panel Technology", `Waaree TOPCON DCR Bi-${data.panelWp}Wp+`],
    ["Inverter", `${data.inverterBrand} ${data.inverterKw} kW On-Grid String`],
    ["Structure", structureLabel(data.revision.structureType)],
    ["Connection", connectionLabel(data.revision.connectionPhase)],
    ["Scheme", "Turnkey EPC with Net Metering (included)"],
    ["Est. Annual Generation", `${data.generation.annualGenerationKwh.toLocaleString("en-IN")} kWh`],
    ["Performance Ratio (est.)", `~${data.generation.performanceRatioPercent}%`],
  ];

  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  for (const [label, value] of summaryRows) {
    doc.font(fonts.regular).fillColor(palette.muted).text(label, CONTENT_LEFT, y, { width: 160 });
    doc.font(fonts.bold).fillColor(palette.ink).text(value, CONTENT_LEFT + 164, y, {
      width: CONTENT_WIDTH - 164,
    });
    y = doc.y + 3;
  }

  y += 4;
  y = sectionTitle(ctx, "Bill of Materials", CONTENT_LEFT, y) + 2;
  y = drawBomTable(ctx, data, y, pageBottom);

  // Scope + commercial (continues after BOM; may start on page 2 if BOM overflowed)
  y = sectionTitle(ctx, "Scope of Work (Ivaan Solar Energy)", CONTENT_LEFT, y) + 2;
  y = drawBulletList(ctx, IVAAN_SCOPE_ITEMS, CONTENT_LEFT, y, CONTENT_WIDTH);

  y = sectionTitle(ctx, "Client Scope", CONTENT_LEFT, y) + 2;
  y = drawBulletList(ctx, CLIENT_SCOPE_ITEMS, CONTENT_LEFT, y, CONTENT_WIDTH);

  y = drawCommercialBlock(ctx, data, y, pageBottom);

  // Generation + environment (continue or new page)
  if (y + 40 > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  } else {
    y += 4;
  }
  y = sectionTitle(ctx, "Generation Estimate", CONTENT_LEFT, y) + 2;

  const genMetrics: Array<[string, string]> = [
    ["Annual Production", `${data.generation.annualGenerationKwh.toLocaleString("en-IN")} kWh`],
    ["Monthly Average", `${data.generation.monthlyAverageKwh.toLocaleString("en-IN")} kWh`],
    ["Specific Generation", `${data.generation.specificGenerationKwhPerKwp.toLocaleString("en-IN")} kWh/kWp/year`],
    ["Performance Ratio", `~${data.generation.performanceRatioPercent}%`],
  ];
  for (const [label, value] of genMetrics) {
    doc.font(fonts.regular).fillColor(palette.muted).text(label, CONTENT_LEFT, y, { width: 180 });
    doc.font(fonts.bold).fillColor(palette.ink).text(value, CONTENT_LEFT + 184, y, { width: CONTENT_WIDTH - 184 });
    y = doc.y + 3;
  }
  y += 2;
  doc.font(fonts.regular).fontSize(7.5).fillColor(palette.muted).text(GENERATION_DISCLAIMER, CONTENT_LEFT, y, {
    width: CONTENT_WIDTH,
  });
  y = doc.y + 6;

  y = drawMonthlyGenerationBarChart(ctx, data.monthlyRows, y, pageBottom);

  const monthColumns: TableColumn[] = [
    { key: "month", label: "Month", width: 90, align: "left", bold: true },
    { key: "kwh", label: "Est. AC Energy (kWh)", width: 120, align: "right" },
  ];
  const monthTableRows = data.monthlyRows.map((row) => ({
    month: row.month,
    kwh: row.acEnergyKwh.toLocaleString("en-IN"),
  }));
  const monthTable = drawTable(ctx, {
    top: y,
    columns: monthColumns,
    rows: monthTableRows,
    pageBottom,
  });
  y = monthTable.y + 8;

  y = sectionTitle(ctx, "Environmental Impact (25 Years)", CONTENT_LEFT, y) + 2;
  const envMetrics: Array<[string, string]> = [
    ["CO₂ Offset", `${data.environmental.co2OffsetMetricTons.toLocaleString("en-IN")} metric tons`],
    ["Equivalent Trees Planted", data.environmental.equivalentTreesPlanted.toLocaleString("en-IN")],
    ["Coal Burn Avoided", `${data.environmental.coalBurnAvoidedMetricTons.toLocaleString("en-IN")} metric tons`],
    ["Petrol Consumption Avoided", `${data.environmental.petrolLitresAvoided.toLocaleString("en-IN")} litres`],
    ["Equivalent km Driven", `${data.environmental.equivalentKmDriven.toLocaleString("en-IN")} km`],
    ["Equivalent Acres of Forest", `${data.environmental.equivalentAcresOfForest.toLocaleString("en-IN")} acres/year`],
  ];
  for (const [label, value] of envMetrics) {
    doc.font(fonts.regular).fillColor(palette.muted).text(label, CONTENT_LEFT, y, { width: 200 });
    doc.font(fonts.bold).fillColor(palette.ink).text(value, CONTENT_LEFT + 204, y, { width: CONTENT_WIDTH - 204 });
    y = doc.y + 3;
  }

  // GST, warranty, payment, Waaree intro, T&C
  if (y + 40 > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  } else {
    y += 4;
  }

  y = sectionTitle(ctx, "GST Breakup", CONTENT_LEFT, y) + 2;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.muted).text(
    `Final amount is GST inclusive. ${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% taxable at ${GST_SPLIT_LOW_RATE}% and ${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% taxable at ${GST_SPLIT_HIGH_RATE}%.`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );
  y = doc.y + 4;

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
  y = gstTable.y + 6;

  y = sectionTitle(ctx, "Warranty", CONTENT_LEFT, y) + 2;
  const warrantyColumns: TableColumn[] = [
    { key: "component", label: "Component", width: 140, align: "left", bold: true },
    { key: "details", label: "Warranty Details", width: CONTENT_WIDTH - 140, align: "left" },
  ];
  const warrantyTable = drawTable(ctx, {
    top: y,
    columns: warrantyColumns,
    rows: WARRANTY_ROWS.map(([component, details]) => ({ component, details })),
    pageBottom,
  });
  y = warrantyTable.y + 2;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.muted).text(WARRANTY_FOOTNOTE, CONTENT_LEFT, y);
  y = doc.y + 6;

  y = sectionTitle(ctx, "Payment Schedule", CONTENT_LEFT, y) + 2;
  y = drawBulletList(
    ctx,
    PAYMENT_MILESTONES.map(([milestone, detail]) => `${milestone}: ${detail}`),
    CONTENT_LEFT,
    y,
    CONTENT_WIDTH,
    8,
  );

  y = sectionTitle(ctx, "Delivery Timeline", CONTENT_LEFT, y) + 2;
  y = drawBulletList(ctx, DELIVERY_TIMELINE, CONTENT_LEFT, y, CONTENT_WIDTH, 8);

  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(`Cancellation: ${CANCELLATION_POLICY}`, CONTENT_LEFT, y, {
    width: CONTENT_WIDTH,
  });
  y = doc.y + 6;

  y = sectionTitle(ctx, "About Waaree", CONTENT_LEFT, y) + 2;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink);
  for (const paragraph of WAAREE_INTRO) {
    doc.text(paragraph, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 4;
  }

  y = sectionTitle(ctx, "Terms & Conditions", CONTENT_LEFT, y) + 2;
  y = drawBulletList(ctx, PROPOSAL_TERMS, CONTENT_LEFT, y, CONTENT_WIDTH, 8);

  const bankDetails = proposal.company.bankDetails || data.profile.bankDetails;
  if (bankDetails) {
    y = sectionTitle(ctx, "Bank Details", CONTENT_LEFT, y) + 2;
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(bankDetails, CONTENT_LEFT, y, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 6;
  }

  drawSignatureBlock(ctx, proposal.company.name, y);

  const companyLine = [proposal.company.name, PROJECT_DOCUMENTS_PHONE, data.profile.email]
    .filter(Boolean)
    .join("  ||  ");
  drawFooter(ctx, companyLine);

  return collectPdfBuffer(doc);
}

export async function generateProjectProposalPdfByFormat(
  proposal: ProjectProposalPdfRecord,
  format: ProjectProposalPdfFormat,
): Promise<Buffer> {
  if (format === "card") {
    return generateProjectProposalQuoteCardPdf(proposal);
  }
  return generateProjectProposalPdf(proposal);
}

/** @deprecated Use generateProjectProposalPdf */
export const generateProjectProposalPdfPlaceholder = generateProjectProposalPdf;
