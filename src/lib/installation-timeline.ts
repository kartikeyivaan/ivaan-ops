export type InstallationTimelineIcon =
  | "check-circle"
  | "folder"
  | "user-check"
  | "laptop"
  | "bank"
  | "structure"
  | "wrench"
  | "solar-panel"
  | "approval"
  | "meter"
  | "subsidy"
  | "shield"
  | "folder-check"
  | "flag";

export type InstallationTimelineStep = {
  title: string;
  duration?: string;
  icon: InstallationTimelineIcon;
  /** Shows an asterisk in the title when true (e.g. name change, loan approval). */
  optional?: boolean;
};

export type InstallationTimelineRowDirection = "ltr" | "rtl";

export type InstallationTimelineRow = {
  direction: InstallationTimelineRowDirection;
  steps: InstallationTimelineStep[];
};

export const INSTALLATION_TIMELINE_TITLE = "Our Installation Timeline";
export const INSTALLATION_TIMELINE_TITLE_LEAD = "Our";
export const INSTALLATION_TIMELINE_TITLE_EMPHASIS = "Installation Timeline";

export const INSTALLATION_TIMELINE_SUBTITLE =
  "A transparent journey from order confirmation to project completion.";

export const INSTALLATION_TIMELINE_FOOTER_NOTE =
  "Actual timelines may vary depending on DISCOM/MSEB approvals, documentation, financing, site readiness, net meter availability and government subsidy processing.";

/** Proposal orange — continuous roadmap connector + icon outlines. */
export const INSTALLATION_TIMELINE_CONNECTOR = "#F59E0B";

export type InstallationTimelineStepWithMeta = InstallationTimelineStep & {
  rowIndex: number;
  direction: InstallationTimelineRowDirection;
};

/** Compact summary for quote-card PDF delivery column. */
export const INSTALLATION_TIMELINE_SUMMARY = [
  "Total project timeline: 30–60 days from order confirmation",
  "Transparent milestones from documentation through commissioning",
  "Includes DISCOM approvals, installation, net metering & subsidy assistance",
];

export const INSTALLATION_TIMELINE_ROW_1: InstallationTimelineStep[] = [
  { title: "Order Confirmed", duration: "Day 0", icon: "check-circle" },
  { title: "Documents", duration: "Day 1–2", icon: "folder" },
  { title: "Name Change*", duration: "+15-30 Days", icon: "user-check", optional: true },
  { title: "DISCOM Application", duration: "Day 3–7", icon: "laptop" },
  { title: "Loan Approval*", duration: "+10-20 Days", icon: "bank", optional: true },
];

export const INSTALLATION_TIMELINE_ROW_2: InstallationTimelineStep[] = [
  { title: "Net Meter Installation", duration: "Day 25–30", icon: "meter" },
  { title: "Meter Approval", duration: "Day 20–25", icon: "approval" },
  { title: "Solar Panel Installation", duration: "Day 18–20", icon: "solar-panel" },
  { title: "Electrical Installation", duration: "Day 15–18", icon: "wrench" },
  { title: "Structure Installation", duration: "Day 7–15", icon: "structure" },
];

export const INSTALLATION_TIMELINE_ROW_3: InstallationTimelineStep[] = [
  { title: "Subsidy Processing", duration: "Day 30–60*", icon: "subsidy" },
  { title: "Warranty Handover", duration: "Day 30–60", icon: "shield" },
  { title: "Document Handover", duration: "Day 30–60", icon: "folder-check" },
  { title: "Project Completed", icon: "flag" },
];

export const INSTALLATION_TIMELINE_ROWS: InstallationTimelineRow[] = [
  { direction: "ltr", steps: INSTALLATION_TIMELINE_ROW_1 },
  { direction: "rtl", steps: INSTALLATION_TIMELINE_ROW_2 },
  { direction: "ltr", steps: INSTALLATION_TIMELINE_ROW_3 },
];

/** Shared column grid so every row uses the same horizontal spacing between milestones. */
export const INSTALLATION_TIMELINE_GRID_COLUMNS = 5;

/** Flat step list in snake-path order (row 1 → row 2 → row 3). */
export const INSTALLATION_TIMELINE_STEPS: InstallationTimelineStepWithMeta[] =
  INSTALLATION_TIMELINE_ROWS.flatMap((row, rowIndex) =>
    row.steps.map((step) => ({
      ...step,
      rowIndex,
      direction: row.direction,
    })),
  );

/** Custom PNG artwork keyed by step icon (stored under assets/installation-timeline). */
export const INSTALLATION_TIMELINE_ICON_FILES: Record<InstallationTimelineIcon, string> = {
  "check-circle": "order-confirm.png",
  folder: "documentation.png",
  "user-check": "name-change.png",
  laptop: "application.png",
  bank: "loan-approval.png",
  structure: "structure-installation.png",
  wrench: "electrical-installation.png",
  "solar-panel": "solar-panel-installation.png",
  approval: "meter-approval.png",
  meter: "net-meter-installation.png",
  subsidy: "subsidy-processing.png",
  shield: "warranty-handover.png",
  "folder-check": "document-handover.png",
  flag: "project-completed.png",
};

/** Public URLs for the web timeline component. */
export const INSTALLATION_TIMELINE_ICON_SRC: Record<InstallationTimelineIcon, string> = {
  "check-circle": "/installation-timeline/order-confirm.png",
  folder: "/installation-timeline/documentation.png",
  "user-check": "/installation-timeline/name-change.png",
  laptop: "/installation-timeline/application.png",
  bank: "/installation-timeline/loan-approval.png",
  structure: "/installation-timeline/structure-installation.png",
  wrench: "/installation-timeline/electrical-installation.png",
  "solar-panel": "/installation-timeline/solar-panel-installation.png",
  approval: "/installation-timeline/meter-approval.png",
  meter: "/installation-timeline/net-meter-installation.png",
  subsidy: "/installation-timeline/subsidy-processing.png",
  shield: "/installation-timeline/warranty-handover.png",
  "folder-check": "/installation-timeline/document-handover.png",
  flag: "/installation-timeline/project-completed.png",
};

/** Simple glyphs for PDF rendering when no PNG asset exists. */
export const INSTALLATION_TIMELINE_PDF_ICONS: Record<InstallationTimelineIcon, string> = {
  "check-circle": "\u2713",
  folder: "\u25A1",
  "user-check": "\u21C4",
  laptop: "\u25A3",
  bank: "\u20B9",
  structure: "\u25B3",
  wrench: "\u26A1",
  "solar-panel": "\u2600",
  approval: "\u2714",
  meter: "\u25CE",
  subsidy: "\u20B9",
  shield: "\u25C6",
  "folder-check": "\u2713",
  flag: "\u2605",
};

/** Aligns with ISE proposal PDF palette + premium tokens. */
export const INSTALLATION_TIMELINE_THEME = {
  heading: "#1C1C1C",
  ink: "#374151",
  muted: "#6B7280",
  accent: "#E8912D",
  border: "#E7E3DC",
  positive: "#059669",
  positiveSoft: "#ECFDF5",
  lightGrey: "#F3F4F6",
  connector: INSTALLATION_TIMELINE_CONNECTOR,
  white: "#FFFFFF",
} as const;

/** @deprecated Use INSTALLATION_TIMELINE_THEME */
export const INSTALLATION_TIMELINE_BRAND = INSTALLATION_TIMELINE_THEME;

export const INSTALLATION_TIMELINE_NODE_SIZE_PX = 56;
export const INSTALLATION_TIMELINE_ICON_SIZE_PX = 28;
export const INSTALLATION_TIMELINE_TITLE_SIZE_PX = 15;
export const INSTALLATION_TIMELINE_DURATION_SIZE_PX = 12;

/** @deprecated Use INSTALLATION_TIMELINE_NODE_SIZE_PX */
export const INSTALLATION_TIMELINE_LEGACY_NODE_SIZE_PX = 68;
