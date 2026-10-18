import { DocumentationStatus, PiCreditStatus } from "@prisma/client";

/** External DCR portal aligned with company codes PCMV and ISE (PCM = PCMV). */
export const DCR_PORTAL_TARGETS = ["PCMV", "ISE"] as const;
export type DcrPortalTarget = (typeof DCR_PORTAL_TARGETS)[number];

export const DCR_PORTAL_STRATEGIES = [
  "PCMV_THEN_ISE",
  "ISE_THEN_PCMV",
  "PCMV_ONLY",
  "ISE_ONLY",
] as const;
export type DcrPortalStrategy = (typeof DCR_PORTAL_STRATEGIES)[number];

export const DEFAULT_DCR_PORTAL_STRATEGY: DcrPortalStrategy = "PCMV_THEN_ISE";

const NDCR_NAME_PATTERN = /NDCR/i;
const N_DCR_NAME_PATTERN = /N-DCR/i;
const DCR_NAME_PATTERN = /DCR/i;

function normalizeProductName(displayName: string): string {
  return displayName.trim();
}

/** True when the product is an NDCR / N-DCR module (not certificate-eligible). */
export function isNonDcrCertificateModule(displayName: string): boolean {
  const name = normalizeProductName(displayName);
  if (!name) return false;
  return NDCR_NAME_PATTERN.test(name) || N_DCR_NAME_PATTERN.test(name);
}

/**
 * True for dispatch lines whose product is a DCR panel eligible for government DCR certificate work.
 * Excludes NDCR and N-DCR naming; requires DCR in the display name after exclusions.
 */
export function isDcrModuleProduct(displayName: string): boolean {
  const name = normalizeProductName(displayName);
  if (!name) return false;
  if (isNonDcrCertificateModule(name)) return false;
  return DCR_NAME_PATTERN.test(name);
}

const DOCUMENTATION_CREDIT_STATUSES: ReadonlySet<PiCreditStatus> = new Set([
  PiCreditStatus.NONE,
  PiCreditStatus.REJECTED,
  PiCreditStatus.CLEARED,
]);

export function isPiEligibleForDcrDocumentation(
  creditStatus: PiCreditStatus | string | null | undefined,
): boolean {
  if (creditStatus == null || creditStatus === "") return false;
  return DOCUMENTATION_CREDIT_STATUSES.has(creditStatus as PiCreditStatus);
}

export function dispatchHasDcrModuleLines(
  lines: ReadonlyArray<{ productDisplayName: string }>,
): boolean {
  return lines.some((line) => isDcrModuleProduct(line.productDisplayName));
}

export function filterDcrModuleLines<T extends { productDisplayName: string }>(
  lines: ReadonlyArray<T>,
): T[] {
  return lines.filter((line) => isDcrModuleProduct(line.productDisplayName));
}

export type ResolveDocumentationInitialStatusInput = {
  creditStatus: PiCreditStatus | string | null | undefined;
  lines: ReadonlyArray<{ productDisplayName: string }>;
};

/**
 * Status to use when creating or re-evaluating dispatch-level documentation from dispatch + PI data.
 */
export function resolveDocumentationInitialStatus(
  input: ResolveDocumentationInitialStatusInput,
): typeof DocumentationStatus.PENDING | typeof DocumentationStatus.NOT_REQUIRED {
  if (!isPiEligibleForDcrDocumentation(input.creditStatus)) {
    return DocumentationStatus.NOT_REQUIRED;
  }
  if (!dispatchHasDcrModuleLines(input.lines)) {
    return DocumentationStatus.NOT_REQUIRED;
  }
  return DocumentationStatus.PENDING;
}

export type DocumentationCreateSource = "invoice_recorded" | "early_dcr";

export function documentationCreateCompletionFields(
  status: typeof DocumentationStatus.PENDING | typeof DocumentationStatus.NOT_REQUIRED,
  completedById: string,
  completedAt: Date = new Date(),
): { completedDate: Date | null; completedById: string | null } {
  if (status === DocumentationStatus.NOT_REQUIRED) {
    return { completedDate: completedAt, completedById };
  }
  return { completedDate: null, completedById: null };
}

export function documentationCreateHistoryRemarks(
  status: typeof DocumentationStatus.PENDING | typeof DocumentationStatus.NOT_REQUIRED,
  source: DocumentationCreateSource,
): string {
  if (status === DocumentationStatus.NOT_REQUIRED) {
    return source === "invoice_recorded"
      ? "Created after invoice recording — DCR not required"
      : "Marked before invoice — DCR not required";
  }
  return source === "invoice_recorded"
    ? "Created after invoice recording"
    : "Marked to send DCR before invoice recording";
}

export type AutomationLineEligibilityInput = {
  productDisplayName: string;
  documentationStatus: DocumentationStatus;
  creditStatus: PiCreditStatus | string | null | undefined;
  /** True when accounts has recorded an invoice on the dispatch handover. */
  invoiceRecorded: boolean;
  /** Run option: allow PENDING documentation before invoice is recorded. */
  includeEarlyDcr: boolean;
};

export function isAutomationQueueEligibleLine(input: AutomationLineEligibilityInput): boolean {
  if (input.documentationStatus !== DocumentationStatus.PENDING) return false;
  if (!isDcrModuleProduct(input.productDisplayName)) return false;
  if (!isPiEligibleForDcrDocumentation(input.creditStatus)) return false;
  if (input.invoiceRecorded) return true;
  return input.includeEarlyDcr;
}

export function filterAutomationQueueEligibleLines<
  T extends AutomationLineEligibilityInput & Record<string, unknown>,
>(lines: ReadonlyArray<T>): T[] {
  return lines.filter((line) => isAutomationQueueEligibleLine(line));
}

/** Ordered portal targets for a run after the first pass fails (dual-pass strategies). */
export function portalAttemptOrder(strategy: DcrPortalStrategy): DcrPortalTarget[] {
  switch (strategy) {
    case "PCMV_THEN_ISE":
      return ["PCMV", "ISE"];
    case "ISE_THEN_PCMV":
      return ["ISE", "PCMV"];
    case "PCMV_ONLY":
      return ["PCMV"];
    case "ISE_ONLY":
      return ["ISE"];
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

/** Next portal for a failed line, or null when no further automated attempt. */
export function nextPortalAfterFailure(
  strategy: DcrPortalStrategy,
  completedPortals: ReadonlyArray<DcrPortalTarget>,
): DcrPortalTarget | null {
  const order = portalAttemptOrder(strategy);
  for (const portal of order) {
    if (!completedPortals.includes(portal)) return portal;
  }
  return null;
}
