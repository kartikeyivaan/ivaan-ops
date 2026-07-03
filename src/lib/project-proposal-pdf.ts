import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import {
  backCalculateGstForPdf,
  GST_SPLIT_HIGH_RATE,
  GST_SPLIT_LOW_RATE,
  GST_SPLIT_HIGH_WEIGHT,
  GST_SPLIT_LOW_WEIGHT,
} from "@/lib/project-proposal-pricing";
import { formatRevisionProposalLabel } from "@/lib/project-proposals";
import {
  amountInWords,
  companyLogo,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  createDocOptions,
  drawDocumentHeader,
  drawFooter,
  drawParties,
  drawTable,
  makeMoney,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  resolvePalette,
  resolveProfile,
  sectionTitle,
  setupFonts,
  type DocContext,
  type TableColumn,
} from "@/lib/pdf-theme";
import { decimalToNumber } from "@/lib/inventory";
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

function drawKeyValueRows(
  ctx: DocContext,
  top: number,
  rows: Array<[string, string]>,
  pageBottom: number,
): number {
  const { doc, palette, fonts } = ctx;
  let y = top;

  for (const [label, value] of rows) {
    if (y + 18 > pageBottom) {
      doc.addPage();
      y = MARGIN_TOP;
    }
    doc.font(fonts.regular).fontSize(8.5).fillColor(palette.muted).text(label, CONTENT_LEFT, y, {
      width: 180,
    });
    doc.font(fonts.bold).fontSize(9).fillColor(palette.ink).text(value, CONTENT_LEFT + 184, y, {
      width: CONTENT_WIDTH - 184,
    });
    y = doc.y + 4;
  }

  return y;
}

function currentRevision(proposal: ProjectProposalPdfRecord) {
  return (
    proposal.revisions.find((entry) => entry.revisionNo === proposal.currentRevisionNo) ??
    proposal.revisions[proposal.revisions.length - 1] ??
    null
  );
}

export async function generateProjectProposalPdf(
  proposal: ProjectProposalPdfRecord,
): Promise<Buffer> {
  const revision = currentRevision(proposal);
  if (!revision) {
    throw new Error("REVISION_NOT_FOUND");
  }

  const doc = new PDFDocument(createDocOptions());
  const fonts = setupFonts(doc);
  const palette = resolvePalette(proposal.company.code);
  const money = makeMoney(fonts.rupee);
  const ctx: DocContext = { doc, palette, fonts };
  const pageBottom = doc.page.height - MARGIN_BOTTOM;

  const profile = resolveProfile(proposal.company);
  const logo = companyLogo(proposal.company.code);

  const headerBottom = drawDocumentHeader(ctx, {
    logo,
    companyName: proposal.company.name,
    title: "Project Proposal",
    profile,
    meta: [
      ["Proposal #", proposal.proposalNo],
      ["Revision", formatRevisionProposalLabel(revision.revisionNo)],
      ["Proposal Date", formatDocumentDate(revision.proposalDate)],
      ["Valid Until", formatDocumentDate(revision.validityDate)],
    ],
  });

  const customerLines = [revision.shortAddress, revision.customerMobile].filter(Boolean);
  const salesContact = proposal.salesUser.mobile ?? proposal.salesUser.email ?? null;
  const partiesBottom = drawParties(ctx, {
    top: headerBottom + 22,
    left: {
      label: "CUSTOMER",
      name: revision.customerName,
      lines: customerLines,
    },
    right: {
      label: "SALES EXECUTIVE",
      name: proposal.salesUser.name,
      lines: salesContact ? [salesContact] : [],
    },
  });

  let y = partiesBottom + 18;

  y = sectionTitle(ctx, "Package Details", CONTENT_LEFT, y) + 4;
  const systemKw = decimalToNumber(revision.package.systemKw);
  y = drawKeyValueRows(ctx, y, [
    ["Package", revision.package.name],
    [
      "Configuration",
      `${revision.package.panelWp}+Wp × ${revision.package.panelCount} panels (${systemKw} kW)`,
    ],
    ["Connection", connectionLabel(revision.connectionPhase)],
    [
      "Inverter Brands",
      ((revision.inverterBrands as string[]) ?? []).join(", ") || "—",
    ],
    [
      "Inverter Upgrade",
      revision.inverterUpgrade?.label ?? "None",
    ],
  ], pageBottom);

  y += 10;
  y = sectionTitle(ctx, "Structure & Building", CONTENT_LEFT, y) + 4;
  y = drawKeyValueRows(
    ctx,
    y,
    [
      ["Structure", structureLabel(revision.structureType)],
      ["Building Type", formatEnumLabel(revision.buildingType)],
      ["Floors Above 2", String(revision.extraFloors)],
    ],
    pageBottom,
  );

  y += 10;
  y = sectionTitle(ctx, "Add-ons", CONTENT_LEFT, y) + 4;
  y = drawKeyValueRows(
    ctx,
    y,
    [
      [
        "Future Structure Provision Panels",
        `${revision.futureStructurePanels} (${money(decimalToNumber(revision.futureStructureAmount))})`,
      ],
      [
        "Additional NDCR Panels",
        `${revision.ndcrAdditionalPanels} (${money(decimalToNumber(revision.ndcrPanelAmount))})`,
      ],
    ],
    pageBottom,
  );

  const finalAmount = decimalToNumber(revision.finalAmount);
  const subsidyEstimate = decimalToNumber(revision.subsidyEstimate);
  const effectiveInvestment = decimalToNumber(revision.effectiveCustomerInvestment);
  const gst = backCalculateGstForPdf(finalAmount);

  y += 10;
  y = sectionTitle(ctx, "Investment Summary", CONTENT_LEFT, y) + 4;
  y = drawKeyValueRows(
    ctx,
    y,
    [
      ["Final Amount (GST Inclusive)", money(finalAmount)],
      ["Estimated Subsidy", money(subsidyEstimate)],
      ["Effective Customer Investment", money(effectiveInvestment)],
    ],
    pageBottom,
  );

  y += 8;
  doc.font(fonts.regular).fontSize(8.5).fillColor(palette.muted).text(
    `Amount in words: ${amountInWords(finalAmount)}`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );
  y = doc.y + 14;

  if (y + 120 > pageBottom) {
    doc.addPage();
    y = MARGIN_TOP;
  }

  y = sectionTitle(ctx, "GST Breakup", CONTENT_LEFT, y) + 6;
  doc.font(fonts.regular).fontSize(8).fillColor(palette.muted).text(
    `Final amount is GST inclusive. ${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% taxable at ${GST_SPLIT_LOW_RATE}% and ${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% taxable at ${GST_SPLIT_HIGH_RATE}%.`,
    CONTENT_LEFT,
    y,
    { width: CONTENT_WIDTH },
  );
  y = doc.y + 8;

  const gstColumns: TableColumn[] = [
    { key: "component", label: "Component", width: 170, align: "left", bold: true },
    { key: "inclusive", label: "GST Inclusive", width: 90, align: "right" },
    { key: "taxable", label: "Taxable Value", width: 90, align: "right" },
    { key: "gst", label: "GST Amount", width: 90, align: "right" },
    { key: "rate", label: "Rate", width: 55, align: "center" },
  ];

  const gstRows = [
    {
      component: `${Math.round(GST_SPLIT_LOW_WEIGHT * 100)}% of final amount`,
      inclusive: money(gst.bucketAt5Percent),
      taxable: money(gst.taxableAt5Percent),
      gst: money(gst.gstAt5Percent),
      rate: `${GST_SPLIT_LOW_RATE}%`,
    },
    {
      component: `${Math.round(GST_SPLIT_HIGH_WEIGHT * 100)}% of final amount`,
      inclusive: money(gst.bucketAt18Percent),
      taxable: money(gst.taxableAt18Percent),
      gst: money(gst.gstAt18Percent),
      rate: `${GST_SPLIT_HIGH_RATE}%`,
    },
    {
      component: "Total",
      inclusive: money(gst.grandTotal),
      taxable: money(gst.totalTaxable),
      gst: money(gst.totalGst),
      rate: "—",
    },
  ];

  const { y: tableBottom } = drawTable(ctx, {
    top: y,
    columns: gstColumns,
    rows: gstRows,
    pageBottom,
  });
  y = tableBottom + 16;

  if (revision.notes?.trim()) {
    if (y + 40 > pageBottom) {
      doc.addPage();
      y = MARGIN_TOP;
    }
    y = sectionTitle(ctx, "Notes", CONTENT_LEFT, y) + 4;
    doc.font(fonts.regular).fontSize(9).fillColor(palette.ink).text(revision.notes, CONTENT_LEFT, y, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 12;
  }

  const companyLine = [proposal.company.name, profile.phone, profile.email]
    .filter(Boolean)
    .join("  ||  ");
  drawFooter(ctx, companyLine);

  return collectPdfBuffer(doc);
}

/** @deprecated Use generateProjectProposalPdf */
export const generateProjectProposalPdfPlaceholder = generateProjectProposalPdf;
