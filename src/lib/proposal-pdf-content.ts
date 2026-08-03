export const WAAREE_FRANCHISEE_TAGLINE = "Authorized Waaree Franchisee";

export const WAAREE_INTRO = [
  "WAAREE is India's largest vertically integrated solar energy solutions company and an MNRE channel partner. As one of India's leading manufacturers of Solar PV Modules with Tier 1 rating, Waaree provides complete turnkey EPC solutions including feasibility analysis, design and engineering, procurement, project management, installation, and commissioning.",
  "With state-of-the-art manufacturing facilities and an annual production capacity exceeding 1.5 GW, Waaree delivers reliable on-grid and off-grid solar systems backed by decades of engineering excellence.",
];

/** Short highlight blocks for premium PDF brand card (derived from WAAREE_INTRO). */
export const WAAREE_HIGHLIGHTS = [
  "India's leading solar PV manufacturer",
  "Tier-1 rated module supplier",
  "MNRE channel partner",
  "Turnkey EPC expertise",
  "1.5 GW+ manufacturing capacity",
];

export const IVAAN_SCOPE_ITEMS = [
  "Design and engineering of the rooftop solar power system",
  "Supply of all equipment including packaging, forwarding, freight, and transit insurance",
  "Project management for timely execution",
  "On-site installation and commissioning",
  "Net metering liaisoning and grid connectivity (included in quoted price)",
];

export const CLIENT_SCOPE_ITEMS = [
  "All civil works including structure grounding and site levelling",
  "Electricity and water at site at no cost to Ivaan Solar Energy",
  "Internet connection with static IP (if required for remote monitoring)",
  "Load extension and related statutory deposits, wherever applicable",
  "Any scope beyond the agreed bill of materials in this proposal",
];

export const WARRANTY_ROWS: Array<[string, string]> = [
  [
    "Solar Modules",
    "30 years against manufacturing defects; power output 90% at end of 10th year, 80% at end of 27th year",
  ],
  ["Inverter", "8 years from date of installation"],
  ["Other BOS Components", "BOS Components Include ACDB, DCDB and other small components used in System"],
];

export const WARRANTY_FOOTNOTE = "All warranties as per respective OEM terms and conditions.";

export const PAYMENT_MILESTONES: Array<[string, string]> = [
  ["50% Advance + LOA", "Along with Letter of Acceptance (for fabrication and booking of panels & inverters)"],
  ["40% Material Readiness", "Against pro forma invoice upon confirmation of material readiness for dispatch"],
  ["10% Commissioning", "After system commissioning, against completion certificate"],
];

export const CANCELLATION_POLICY =
  "In case of cancellation, the customer shall pay for proportionate work completed plus 10% of the balance project value. Advance paid is non-refundable except as mutually agreed based on project progress.";

export const ISE_BANK_DETAILS = [
  "Account Name: Ivaan Solar Energy",
  "IFSC: ICIC0000375 | Jalgaon Branch",
  "Account Number: 037505012379",
  "Account Type: Over Draft",
].join("\n");

export const SUBSIDY_NOTE =
  "Central Government subsidy (₹78,000) is credited directly to the beneficiary account per MNRE norms after commissioning. The gross project cost stated above is payable by the customer; NDCR panels are not eligible for subsidy.";

export function formatCommercialOfferSubsidyNote(
  subsidyAmount: string,
  effectiveInvestment: string,
): string {
  return `Central Government subsidy (${subsidyAmount}) is credited directly to the beneficiary account per MNRE norms after commissioning. The gross project cost stated above is payable by the customer; NDCR panels are not eligible for subsidy. Net effective investment: ${effectiveInvestment}.`;
}

/** Official contact shown on project proposal / quote card PDFs. */
export const PROJECT_DOCUMENTS_PHONE = "+91 8390 201918";

export const GENERATION_DISCLAIMER =
  "Generation estimates are based on 1,550 kWh/kWp/year for Maharashtra, with monthly distribution reflecting average solar irradiance at Jalgaon. Actual generation depends on site conditions, shading, cleaning, and grid availability.";

export const PROPOSAL_TERMS = [
  "Any MNRE subsidy or exemption shall be passed on to the client as per applicable government policy.",
  CANCELLATION_POLICY,
];
