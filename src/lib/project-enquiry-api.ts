import { NextResponse } from "next/server";

const SERVICE_ERRORS: Record<string, { message: string; status: number }> = {
  COMPANY_NOT_FOUND: { message: "Company not found.", status: 404 },
  PROJECTS_ISE_ONLY: {
    message: "Project proposals, projects and project dispatches are available only for Ivaan Solar Energy.",
    status: 403,
  },
  ENQUIRY_NOT_FOUND: { message: "Project enquiry not found.", status: 404 },
  FORBIDDEN: { message: "You do not have access to this enquiry.", status: 403 },
  ENQUIRY_NOT_EDITABLE: {
    message: "Only open or proposal-sent enquiries can be edited.",
    status: 400,
  },
  ENQUIRY_CLOSED: { message: "This enquiry is already closed.", status: 400 },
  PROPOSAL_REQUIRED: { message: "Link a proposal before marking enquiry as won.", status: 400 },
  ENQUIRY_ALREADY_HAS_PROPOSAL: { message: "A proposal is already linked to this enquiry.", status: 400 },
  ALREADY_WON: { message: "Enquiry is already marked as won.", status: 400 },
  ALREADY_LOST: { message: "Enquiry is already marked as lost.", status: 400 },
};

export function projectEnquiryErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function mapProjectEnquiryError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const mapped = SERVICE_ERRORS[error.message];
  if (!mapped) return null;
  return projectEnquiryErrorResponse(error.message, mapped.message, mapped.status);
}
