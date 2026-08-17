import { ProposalStructureType } from "@prisma/client";

export type BomLine = {
  sr: number;
  item: string;
  description: string;
  qty: string;
  capacity: string;
  make: string;
  /** Sub-line under Solar PV Module (DCR / NDCR). */
  isModuleVariant?: boolean;
  /** Description spans qty/capacity/make columns (transport, install). */
  spanDetailColumns?: boolean;
};

export function structureDescription(structureType: ProposalStructureType | string): string {
  switch (structureType) {
    case ProposalStructureType.PREFAB_C_CHANNEL:
      return "Pre-fabricated C Channel GI Structure as per design";
    case ProposalStructureType.MONO_RAIL:
      return "Mono Rail GI Structure as per design";
    default:
      return "Strt Putling 41×41×2mm, Thickness 2mm Galvanized GI Pipe 3 × 1.5\"";
  }
}

/** Default on-grid inverter for 6-panel DCR packages when no upgrade is selected. */
export const DEFAULT_INVERTER_CAPACITY_KW = 3;

/** Base on-grid inverter for 9-panel DCR packages (P3 / P4) when no upgrade is selected. */
export const NINE_PANEL_INVERTER_CAPACITY_KW = 5;

/**
 * Package-included inverter AC capacity (before optional upgrade).
 * 6-panel packages include 3 kW; 9-panel packages include 5 kW.
 */
export function baseInverterKwForPanelCount(panelCount: number | null | undefined): number {
  if (panelCount != null && panelCount >= 9) {
    return NINE_PANEL_INVERTER_CAPACITY_KW;
  }
  return DEFAULT_INVERTER_CAPACITY_KW;
}

/**
 * Inverter AC capacity for DCR package proposals.
 * Uses the selected inverter upgrade when present; otherwise the package base inverter.
 * DC kWp from additional panels must not change inverter size.
 */
export function resolveInverterKw(
  upgradeKw: number | null | undefined,
  panelCount?: number | null,
): number {
  if (upgradeKw != null && upgradeKw > 0) {
    return upgradeKw;
  }
  return baseInverterKwForPanelCount(panelCount);
}

/** Total DC nameplate kWp from all proposed panels (one decimal). */
export function calculateProposedSystemKwp(input: {
  panelWp: number;
  panelCount: number;
  dcrAdditionalPanels: number;
  ndcrPanelWp: number;
  ndcrAdditionalPanels: number;
  futureStructurePanels: number;
}): number {
  const totalWp =
    input.panelWp * (input.panelCount + input.dcrAdditionalPanels) +
    input.ndcrPanelWp * input.ndcrAdditionalPanels +
    input.panelWp * input.futureStructurePanels;
  return Math.round((totalWp / 1000) * 10) / 10;
}

/** DC nameplate kWp from base package + additional DCR/NDCR panels (excludes future structure). */
export function calculateTotalSystemKw(input: {
  panelWp: number;
  panelCount: number;
  dcrAdditionalPanels: number;
  ndcrPanelWp: number;
  ndcrAdditionalPanels: number;
}): number {
  const totalWp =
    input.panelWp * input.panelCount +
    input.panelWp * input.dcrAdditionalPanels +
    input.ndcrPanelWp * input.ndcrAdditionalPanels;
  return Math.round((totalWp / 1000) * 100) / 100;
}

/** Structure panel count: base package panels + additional structure provision. */
export function calculateStructureCapacity(
  panelCount: number,
  futureStructurePanels: number,
): number {
  return panelCount + futureStructurePanels;
}

export function formatDcrPanelLabel(panelWp: number): string {
  return `Waaree ${panelWp}+Wp DCR`;
}

/** DCR module technology label for proposal PDF (BOM + project summary). */
export function formatDcrPanelTechnology(panelWp: number): string {
  const tech = panelWp < 570 ? "Mono-PERC" : "TOPCON";
  return `Waaree ${tech} DCR Bi-${panelWp}+Wp`;
}

export function formatDcrPanelModuleDescription(panelWp: number): string {
  return `${formatDcrPanelTechnology(panelWp)} Modules`;
}

export function formatNdcrPanelLabel(ndcrPanelWp: number): string {
  return `Waaree ${ndcrPanelWp}+Wp NDCR`;
}

export function formatNdcrPanelTechnology(
  panelWp: number,
  moduleDisplayName?: string | null,
): string {
  const name = moduleDisplayName?.trim();
  if (name) {
    return name.replace(/\s+modules$/i, "").trim();
  }
  return `Waaree NDCR Bi-${panelWp}+Wp`;
}

export function formatNdcrPanelModuleDescription(
  panelWp: number,
  moduleDisplayName?: string | null,
): string {
  const tech = formatNdcrPanelTechnology(panelWp, moduleDisplayName);
  return /modules$/i.test(tech) ? tech : `${tech} Modules`;
}

export function formatQuoteCardPanelLine(input: {
  ndcrComplete: boolean;
  panelWp: number;
  panelCount: number;
  dcrAdditionalPanels: number;
  ndcrPanelWp: number;
  ndcrAdditionalPanels: number;
  moduleDisplayName?: string | null;
}): string {
  if (input.ndcrComplete) {
    const label = input.moduleDisplayName?.trim()
      ? input.moduleDisplayName.trim()
      : `Waaree ${input.panelWp}+Wp`;
    return `NDCR: ${label} × ${input.panelCount}`;
  }

  const dcrLine = `DCR: Waaree ${input.panelWp}+Wp × ${input.panelCount + input.dcrAdditionalPanels}`;
  const ndcrLine =
    input.ndcrAdditionalPanels > 0
      ? ` | NDCR: Waaree ${input.ndcrPanelWp}+Wp × ${input.ndcrAdditionalPanels}`
      : "";
  return `${dcrLine}${ndcrLine}`;
}

export function totalProposedPanelCount(input: {
  panelCount: number;
  dcrAdditionalPanels: number;
  ndcrAdditionalPanels: number;
  futureStructurePanels: number;
}): number {
  return (
    input.panelCount +
    input.dcrAdditionalPanels +
    input.ndcrAdditionalPanels +
    input.futureStructurePanels
  );
}

export function formatInverterCapacity(kw: number, connectionPhase: string): string {
  const phase = connectionPhase === "THREE_PHASE" ? "3 Phase" : "Single Phase";
  return `${kw} kW (${phase})`;
}

export function buildProposalBom(input: {
  panelWp: number;
  panelCount: number;
  systemKw: number;
  dcrAdditionalPanels: number;
  ndcrAdditionalPanels: number;
  ndcrPanelWp: number;
  inverterBrand: string;
  inverterKw: number;
  connectionPhase: string;
  structureType: ProposalStructureType | string;
  ndcrComplete?: boolean;
  moduleDisplayName?: string | null;
  moduleMake?: string | null;
}): BomLine[] {
  const lines: BomLine[] = [];
  const totalDcrPanels = input.panelCount + input.dcrAdditionalPanels;

  if (input.ndcrComplete) {
    const capacityLabel = input.panelWp > 0 ? `${input.panelWp}Wp` : "—";
    lines.push({
      sr: 1,
      item: "Solar PV Module",
      description: formatNdcrPanelModuleDescription(input.panelWp, input.moduleDisplayName),
      qty: String(input.panelCount),
      capacity: capacityLabel,
      make: input.moduleMake?.trim() || "Waaree",
    });
  } else {
    lines.push({
      sr: 1,
      item: "Solar PV Module",
      description: formatDcrPanelModuleDescription(input.panelWp),
      qty: String(totalDcrPanels),
      capacity: `${input.panelWp}Wp+`,
      make: "Waaree",
    });
  }

  if (!input.ndcrComplete && input.ndcrAdditionalPanels > 0) {
    lines.push({
      sr: 1,
      item: "",
      description: `Waaree NDCR Bi-${input.ndcrPanelWp}Wp+ Modules`,
      qty: String(input.ndcrAdditionalPanels),
      capacity: `${input.ndcrPanelWp}Wp+`,
      make: "Waaree",
      isModuleVariant: true,
    });
  }

  lines.push(
    {
      sr: 2,
      item: "Solar Inverter",
      description: "On Grid String Inverter",
      qty: "1",
      capacity: formatInverterCapacity(input.inverterKw, input.connectionPhase),
      make: input.inverterBrand,
    },
    {
      sr: 3,
      item: "Structure",
      description: structureDescription(input.structureType),
      qty: "As Per Design",
      capacity: `${Math.round(input.systemKw * 10) / 10} kW`,
      make: "—",
    },
    {
      sr: 4,
      item: "Cable",
      description: "As per project requirements and PCU specifications",
      qty: "—",
      capacity: "—",
      make: "—",
    },
    {
      sr: 5,
      item: "AC/DC Distribution box",
      description: "As per design",
      qty: "1 Set",
      capacity: "—",
      make: "—",
    },
    {
      sr: 6,
      item: "Earthing Kit with LA",
      description:
        "Maintenance free earthing with accessories; Lightning Arrestor with structure clamp",
      qty: "1 Set",
      capacity: "—",
      make: "—",
    },
    {
      sr: 7,
      item: "Transportation",
      description: "Transportation of material to the site of installation",
      qty: "",
      capacity: "",
      make: "",
      spanDetailColumns: true,
    },
    {
      sr: 8,
      item: "Installation",
      description: "Material unloading, lifting, installation and commissioning",
      qty: "",
      capacity: "",
      make: "",
      spanDetailColumns: true,
    },
  );

  return lines;
}
