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

export function resolveInverterKw(
  systemKw: number,
  upgradeKw: number | null | undefined,
): number {
  if (upgradeKw && upgradeKw > 0) {
    return upgradeKw;
  }
  return Math.round(systemKw);
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

export function formatNdcrPanelLabel(ndcrPanelWp: number): string {
  return `Waaree ${ndcrPanelWp}+Wp NDCR`;
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
}): BomLine[] {
  const lines: BomLine[] = [];
  const totalDcrPanels = input.panelCount + input.dcrAdditionalPanels;

  lines.push({
    sr: 1,
    item: "Solar PV Module",
    description: `Waaree TOPCON DCR Bi-${input.panelWp}Wp+ Modules`,
    qty: String(totalDcrPanels),
    capacity: `${input.panelWp}Wp+`,
    make: "Waaree",
  });

  if (input.ndcrAdditionalPanels > 0) {
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
