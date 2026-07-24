import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { restrictServiceToAssigned } from "@/lib/service-permissions";
import { getServiceCompany } from "@/lib/service-service";

export function serviceError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export type ServiceAccess =
  | { ok: true; companyId: string; restrictToUserId: string | null }
  | { ok: false; response: NextResponse };

/**
 * Resolve the Service company context. Service is bound to the Ivaan (ISE)
 * company only; the acting user must have access to it (Super Admin bypasses).
 * Also computes whether the user's data must be limited to their own
 * assignments (executives without the view-all capability).
 */
export async function resolveServiceAccess(session: Session): Promise<ServiceAccess> {
  let company: { id: string };
  try {
    company = await getServiceCompany(prisma);
  } catch {
    return {
      ok: false,
      response: serviceError(
        "SERVICE_UNAVAILABLE",
        "The Service module is not configured for this environment.",
        500,
      ),
    };
  }

  const roles = session.user.roles;
  const userCompanyIds = session.user.companies.map((company) => company.id);
  if (!isSuperAdmin(roles) && !userCompanyIds.includes(company.id)) {
    return {
      ok: false,
      response: serviceError(
        "FORBIDDEN",
        "The Service module is available for Ivaan only.",
        403,
      ),
    };
  }

  const restrictToUserId = restrictServiceToAssigned(roles) ? session.user.id : null;
  return { ok: true, companyId: company.id, restrictToUserId };
}

const ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "Service request not found.", status: 404 },
  COMPANY_NOT_FOUND: { code: "NOT_FOUND", message: "Company not found.", status: 404 },
  WORK_TYPE_NOT_FOUND: { code: "NOT_FOUND", message: "Work type not found.", status: 404 },
  WORK_TYPE_REQUIRED: { code: "VALIDATION_ERROR", message: "Select a work type.", status: 400 },
  CUSTOM_WORK_TYPE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Enter the work type name.",
    status: 400,
  },
  INVALID_TRANSITION: {
    code: "INVALID_TRANSITION",
    message: "That status change is not allowed.",
    status: 400,
  },
  USE_DEDICATED_ACTION: {
    code: "VALIDATION_ERROR",
    message: "Use the dedicated Complete, Close or Reopen action for this status.",
    status: 400,
  },
  NO_STATUS_CHANGE: {
    code: "VALIDATION_ERROR",
    message: "The request is already in that status.",
    status: 400,
  },
  NOTE_REQUIRED: { code: "VALIDATION_ERROR", message: "A note is required.", status: 400 },
  WAITING_REASON_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Select a waiting reason.",
    status: 400,
  },
  ASSIGNEE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Assign an executive before moving to Assigned.",
    status: 400,
  },
  INVALID_ASSIGNEE: {
    code: "VALIDATION_ERROR",
    message: "Select a valid service executive.",
    status: 400,
  },
  INVALID_AMOUNT: {
    code: "VALIDATION_ERROR",
    message: "Enter a payment amount greater than zero.",
    status: 400,
  },
  CONTACT_MODE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Select a contact mode.",
    status: 400,
  },
  VISIT_DATE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Select a visit date.",
    status: 400,
  },
  VISIT_EXECUTIVE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Select the executive for the visit.",
    status: 400,
  },
  VISIT_RESULT_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Enter the visit result.",
    status: 400,
  },
  MATERIAL_DETAILS_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Enter the material details.",
    status: 400,
  },
  DUPLICATE_WORK_TYPE: {
    code: "DUPLICATE",
    message: "A work type with this name already exists.",
    status: 409,
  },
  SERVICE_COMPANY_NOT_FOUND: {
    code: "SERVICE_UNAVAILABLE",
    message: "The Service module is not configured for this environment.",
    status: 500,
  },
};

/** Translate a thrown service-layer Error into an API response, or rethrow. */
export function mapServiceError(error: unknown): NextResponse {
  if (error instanceof Error && ERROR_MAP[error.message]) {
    const mapped = ERROR_MAP[error.message];
    return serviceError(mapped.code, mapped.message, mapped.status);
  }
  throw error;
}
