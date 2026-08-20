import { NextResponse } from "next/server";

const PRICING_ERRORS: Record<string, string> = {
  PACKAGE_NOT_FOUND: "Package not found.",
  PACKAGE_UNAVAILABLE: "Selected package is unavailable.",
  INVERTER_BRANDS_REQUIRED: "Select at least one inverter brand.",
  INVERTER_BRAND_NOT_FOUND: "One or more inverter brands were not found.",
  INVERTER_BRAND_UNAVAILABLE: "One or more selected inverter brands are unavailable.",
  INVERTER_UPGRADE_NOT_FOUND: "Inverter upgrade not found.",
  INVERTER_UPGRADE_UNAVAILABLE: "Selected inverter upgrade is unavailable.",
  INVERTER_UPGRADE_NOT_APPLICABLE: "Selected inverter upgrade does not apply to this package.",
  NDCR_NOT_APPLICABLE: "NDCR panels are only available for 570+Wp packages.",
  DCR_NOT_APPLICABLE: "Additional DCR panels are only available for 530+Wp packages.",
  NDCR_MODULE_REQUIRED: "Select a module product for the NDCR project.",
  NDCR_MODULE_QTY_REQUIRED: "Enter module quantity for the NDCR project.",
  NDCR_INVERTER_CAPACITY_REQUIRED: "Enter inverter capacity for the NDCR project.",
  NDCR_MODULE_NOT_FOUND: "Selected module product was not found.",
  NDCR_MODULE_INVALID: "Selected product must be from the Modules category.",
};

const SERVICE_ERRORS: Record<string, { message: string; status: number }> = {
  COMPANY_NOT_FOUND: { message: "Company not found.", status: 404 },
  PROJECTS_ISE_ONLY: {
    message: "Project proposals, projects and project dispatches are available only for Ivaan Solar Energy.",
    status: 403,
  },
  PROPOSAL_NOT_FOUND: { message: "Project proposal not found.", status: 404 },
  REVISION_NOT_FOUND: { message: "Proposal revision not found.", status: 404 },
  FORBIDDEN: { message: "You do not have access to this proposal.", status: 403 },
  PROPOSAL_NOT_EDITABLE: { message: "Only draft or rejected proposals can be edited.", status: 400 },
  INVALID_STATUS: { message: "This action is not allowed for the current proposal status.", status: 400 },
  DISCOUNT_APPROVAL_REQUIRED: {
    message: "Discount above ₹5,000 requires manager approval before sending.",
    status: 400,
  },
  APPROVAL_NOT_REQUIRED: {
    message: "Manager approval is only required when discount exceeds ₹5,000.",
    status: 400,
  },
  POST_CONVERSION_APPROVAL_REQUIRED: {
    message: "Changes to a converted proposal must be approved by the Projects Manager.",
    status: 400,
  },
  PROJECT_CLOSED: {
    message: "This project is closed. The linked proposal cannot be revised.",
    status: 400,
  },
  APPROVAL_NOT_PENDING: { message: "No pending approval request found.", status: 400 },
  NOT_APPROVED: {
    message: "Only approved or expired proposals can be converted to a project.",
    status: 400,
  },
  CONVERSION_WINDOW_EXPIRED: {
    message: "Project conversion is allowed only within 45 days from proposal date.",
    status: 400,
  },
  ALREADY_CONVERTED: { message: "Proposal has already been converted.", status: 400 },
  PROJECTS_WAREHOUSE_NOT_FOUND: {
    message: "Jalgaon Projects warehouse is not configured for this company.",
    status: 500,
  },
  DRAFT_CANNOT_REVISE: { message: "Revise a sent or approved proposal, not a draft.", status: 400 },
  REJECT_REASON_REQUIRED: { message: "A rejection reason is required.", status: 400 },
  PROPOSAL_NOT_SHAREABLE: {
    message: "Only sent, approved, expired, or converted proposals can be downloaded or shared.",
    status: 400,
  },
};

export function projectProposalErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function mapProjectProposalError(error: unknown) {
  if (!(error instanceof Error)) return null;

  if (PRICING_ERRORS[error.message]) {
    return projectProposalErrorResponse(error.message, PRICING_ERRORS[error.message], 400);
  }

  const mapped = SERVICE_ERRORS[error.message];
  if (mapped) {
    return projectProposalErrorResponse(error.message, mapped.message, mapped.status);
  }

  return null;
}
