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
import { isNdcrCompletePackage } from "@/lib/project-proposal-packages";
import { formatProposalDocumentNumber } from "@/lib/project-proposals";
import {
  buildProposalBom,
  calculateStructureCapacity,
  calculateTotalSystemKw,
  resolveInverterKw,
  type BomLine,
} from "@/lib/proposal-bom";
import {
  calculateEnvironmentalImpact,
  calculateGenerationEstimate,
  calculateMonthlyGeneration,
} from "@/lib/proposal-generation";
import {
  GENERATION_DISCLAIMER,
  PAYMENT_MILESTONES,
  PROJECT_DOCUMENTS_PHONE,
  SUBSIDY_NOTE,
  WARRANTY_FOOTNOTE,
  WARRANTY_ROWS,
} from "@/lib/proposal-pdf-content";
import { INSTALLATION_TIMELINE_SUMMARY } from "@/lib/installation-timeline";
import {
  drawBankDetailsCard,
  drawCoverLetterPremium,
  drawInstallationTimeline,
  drawDualBrandProposalHeader,
  drawGenerationEstimateSection,
  drawImpactCards,
  drawPaymentTimeline,
  drawPremiumBomTable,
  drawPremiumSectionTitle,
  drawPricingCard,
  drawProjectSummaryCards,
  drawScopeCards,
  drawSignatureBlock,
  drawTermsSection,
  drawWaareeBrandCard,
  drawWarrantyCards,
  estimateProjectSummaryCardHeight,
  estimateGenerationEstimateSectionMinHeight,
  startNewPage,
  type ProposalLayoutContext,
} from "@/lib/proposal-pdf-components";
import {
  companyLogo,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  createDocOptions,
  drawFooter,
  drawParties,
  drawProjectQuotationHeader,
  makeMoney,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  resolvePalette,
  resolveProfile,
  sectionTitle,
  setupFonts,
  waareeLogo,
  type DocContext,
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

function quoteCardStructurePhrase(value: string): string {
  const label = structureLabel(value);
  return label.endsWith("Structure")
    ? `${label} of`
    : `${label} Structure of`;
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

  const panelWp = revision.package.panelWp;
  const panelCount = revision.package.panelCount;
  const ndcrPanelWp = revision.ndcrPanelWp ?? 580;
  const ndcrComplete = isNdcrCompletePackage(revision.package.code);
  const systemKw = ndcrComplete
    ? decimalToNumber(revision.inverterCapacityKw ?? 0)
    : calculateTotalSystemKw({
        panelWp,
        panelCount,
        dcrAdditionalPanels: revision.dcrAdditionalPanels,
        ndcrPanelWp,
        ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
      });
  const brands = (revision.inverterBrands as string[]) ?? [];
  const inverterBrand = brands.length > 0 ? brands.join("/") : "—";
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
      dcrAdditionalPanels: revision.dcrAdditionalPanels,
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
  // Quote card uses the footer band for signature; shrink the bottom margin so
  // PDFKit does not auto-paginate before the footer line.
  const quoteCardBottomMargin = 56;
  doc.page.margins.bottom = quoteCardBottomMargin;
  const pageBottom = doc.page.height - quoteCardBottomMargin;
  const { revision } = data;

  const totalSystemKw = calculateTotalSystemKw({
    panelWp: data.panelWp,
    panelCount: data.panelCount,
    dcrAdditionalPanels: revision.dcrAdditionalPanels,
    ndcrPanelWp: data.ndcrPanelWp,
    ndcrAdditionalPanels: revision.ndcrAdditionalPanels,
  });
  const structureCapacity = calculateStructureCapacity(
    data.panelCount,
    revision.futureStructurePanels,
  );

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
    `${totalSystemKw} kW On-Grid Rooftop Solar System`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );
  y = doc.y + 5;

  const dcrLine = `DCR: Waaree ${data.panelWp}+Wp × ${data.panelCount + revision.dcrAdditionalPanels}`;
  const ndcrLine =
    revision.ndcrAdditionalPanels > 0
      ? ` | NDCR: Waaree ${data.ndcrPanelWp}+Wp × ${revision.ndcrAdditionalPanels}`
      : "";
  const inverterLine = `Inverter: ${data.inverterBrand} ${data.inverterKw} kW | ${connectionLabel(revision.connectionPhase)} | ${quoteCardStructurePhrase(revision.structureType)} ${structureCapacity} Panels`;

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
  for (const line of INSTALLATION_TIMELINE_SUMMARY) {
    doc.text(line, rightColX, delY, { width: colW });
    delY = doc.y + 4;
  }
  y = Math.max(payY, delY) + 6;

  const infoTop = y;
  const warrantyText = formatQuoteCardWarranty();
  const warrantyY = sectionTitle(ctx, "Warranty", CONTENT_LEFT, infoTop, colW, 10) + 3;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(warrantyText, CONTENT_LEFT, warrantyY, {
    width: colW,
  });
  const warrantyBottom = doc.y;

  const bankDetails = proposal.company.bankDetails || profile.bankDetails;
  let bankBottom = infoTop;
  if (bankDetails) {
    const bankY = sectionTitle(ctx, "Bank Details", rightColX, infoTop, colW, 10) + 3;
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.ink).text(bankDetails, rightColX, bankY, {
      width: colW,
    });
    bankBottom = doc.y;
  }

  y = Math.max(warrantyBottom, bankBottom) + 10;
  drawSignatureBlock(ctx, proposal.company.name, y, 9, false, pageBottom);

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
  const layout: ProposalLayoutContext = { ...ctx, pageBottom };
  const { revision } = data;

  const headerMeta: Array<[string, string]> = [
    ["Proposal No.", data.documentNo],
    ["Proposal Date", formatDocumentDate(revision.proposalDate)],
    ["Valid Until", formatDocumentDate(revision.validityDate)],
    ["Customer Name", revision.customerName],
    ["Project Capacity", `${data.systemKw} kWp`],
    ["Short Address", revision.shortAddress || "—"],
  ];
  if (revision.revisionNo > 0) {
    headerMeta.push(["Proposal Version", `Rev. ${revision.revisionNo}`]);
  }

  const headerBottom = drawDualBrandProposalHeader(ctx, {
    companyCode: proposal.company.code,
    companyName: proposal.company.name,
    title: "Techno-Commercial Proposal",
    meta: headerMeta,
  });

  let y = drawCoverLetterPremium(
    ctx,
    {
      proposalDate: revision.proposalDate,
      customerName: revision.customerName,
      systemKw: data.systemKw,
      companyName: proposal.company.name,
    },
    headerBottom + 2,
  );

  y = drawPremiumSectionTitle(ctx, "Bill of Materials", CONTENT_LEFT, y, CONTENT_WIDTH, true);
  y = drawPremiumBomTable(layout, { bom: data.bom }, y);

  const projectSummaryRows: Array<[string, string]> = [
    ["Project Capacity", `${data.systemKw} kWp On-Grid Rooftop`],
    ["Panel Technology", `Waaree TOPCON DCR Bi-${data.panelWp}Wp+`],
    ["Inverter", `${data.inverterBrand} ${data.inverterKw} kW On-Grid String`],
    ["Structure", structureLabel(revision.structureType)],
    ["Connection", connectionLabel(revision.connectionPhase)],
    ["Scheme", "Turnkey EPC with Net Metering (included)"],
    ["Est. Annual Generation", `${data.generation.annualGenerationKwh.toLocaleString("en-IN")} kWh`],
    ["Performance Ratio (est.)", `~${data.generation.performanceRatioPercent}%`],
  ];
  y = drawPremiumSectionTitle(ctx, "Project Summary", CONTENT_LEFT, y, CONTENT_WIDTH, false, {
    pageBottom,
    minFollowingHeight: estimateProjectSummaryCardHeight(projectSummaryRows.length),
  });
  y = drawProjectSummaryCards(layout, projectSummaryRows, y);

  y = drawScopeCards(layout, y);

  y = drawPremiumSectionTitle(ctx, "Generation Estimate", CONTENT_LEFT, y, CONTENT_WIDTH, false, {
    pageBottom,
    minFollowingHeight: estimateGenerationEstimateSectionMinHeight(),
  });
  y = drawGenerationEstimateSection(
    layout,
    {
      metrics: [
        { label: "Annual Production", value: `${data.generation.annualGenerationKwh.toLocaleString("en-IN")} kWh` },
        { label: "Monthly Average", value: `${data.generation.monthlyAverageKwh.toLocaleString("en-IN")} kWh` },
        {
          label: "Specific Generation",
          value: `${data.generation.specificGenerationKwhPerKwp.toLocaleString("en-IN")} kWh/kWp/yr`,
        },
        { label: "Performance Ratio", value: `~${data.generation.performanceRatioPercent}%` },
      ],
      disclaimer: GENERATION_DISCLAIMER,
      monthlyRows: data.monthlyRows,
      monthlyAverageKwh: data.generation.monthlyAverageKwh,
    },
    y,
  );
  y = drawWarrantyCards(layout, y, { anchorToPageBottom: true });

  y = startNewPage(layout);
  y = drawPremiumSectionTitle(ctx, "Commercial Offer", CONTENT_LEFT, y, CONTENT_WIDTH, true, {
    skipGapBefore: true,
  });
  y = drawPricingCard(layout, {
    finalAmount: data.finalAmount,
    subsidyEstimate: data.subsidyEstimate,
    effectiveInvestment: data.effectiveInvestment,
    money: data.money,
    gstSplitNote: `GST split: ${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% supply @ ${GST_SPLIT_LOW_RATE}% (${data.money(data.gst.bucketAt5Percent)}) · ${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% installation @ ${GST_SPLIT_HIGH_RATE}% (${data.money(data.gst.bucketAt18Percent)})`,
  }, y);

  y = drawPaymentTimeline(layout, y);
  y = drawInstallationTimeline(layout, y);

  y = startNewPage(layout);
  y = drawPremiumSectionTitle(ctx, "Environmental Impact (25 Years)", CONTENT_LEFT, y, CONTENT_WIDTH, false, {
    skipGapBefore: true,
  });
  y = drawImpactCards(layout, [
    {
      label: "CO₂ Offset",
      value: `${data.environmental.co2OffsetMetricTons.toLocaleString("en-IN")} MT`,
    },
    {
      label: "Equivalent Trees Planted",
      value: data.environmental.equivalentTreesPlanted.toLocaleString("en-IN"),
    },
    {
      label: "Coal Burn Avoided",
      value: `${data.environmental.coalBurnAvoidedMetricTons.toLocaleString("en-IN")} MT`,
    },
    {
      label: "Petrol Consumption Avoided",
      value: `${data.environmental.petrolLitresAvoided.toLocaleString("en-IN")} L`,
    },
    {
      label: "Equivalent KM Driven",
      value: `${data.environmental.equivalentKmDriven.toLocaleString("en-IN")} km`,
    },
    {
      label: "Equivalent Acres of Forest",
      value: `${data.environmental.equivalentAcresOfForest.toLocaleString("en-IN")} ac/yr`,
    },
  ], y);

  y = drawWaareeBrandCard(layout, y);
  y = drawTermsSection(layout, y);

  const bankDetails = proposal.company.bankDetails || data.profile.bankDetails;
  if (bankDetails) {
    y = drawBankDetailsCard(layout, bankDetails, proposal.company.name, y);
  } else {
    drawSignatureBlock(ctx, proposal.company.name, y);
  }

  const companyLine = [proposal.company.name, PROJECT_DOCUMENTS_PHONE, data.profile.email]
    .filter(Boolean)
    .join("  |  ");
  drawFooter(ctx, companyLine, { documentNo: data.documentNo });

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
