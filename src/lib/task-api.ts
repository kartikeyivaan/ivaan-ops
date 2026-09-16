import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { resolveDashboardCompanyIds } from "@/lib/company-scope";
import { requireActiveCompany } from "@/lib/session";
import type { TaskActorContext } from "@/lib/task-service";

export function taskError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ code, message, details }, { status });
}

export function actorFromSession(session: Session) {
  return { id: session.user.id, roles: session.user.roles ?? [] };
}

export function accessibleCompanyIdsFromSession(session: Session): string[] {
  return resolveDashboardCompanyIds(session);
}

export function taskActorFromSession(session: Session): TaskActorContext {
  let companyId: string | null = null;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    companyId = session.user.activeCompanyId ?? null;
  }
  return {
    id: session.user.id,
    roles: session.user.roles ?? [],
    companyId,
    accessibleCompanyIds: accessibleCompanyIdsFromSession(session),
  };
}

const ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "Task not found.", status: 404 },
  FORBIDDEN: { code: "FORBIDDEN", message: "You do not have permission for this action.", status: 403 },
  PRIVATE_TASK: { code: "NOT_FOUND", message: "Task not found.", status: 404 },
  COMPANY_REQUIRED: { code: "COMPANY_REQUIRED", message: "Select a company to continue.", status: 400 },
  INVALID_TRANSITION: {
    code: "INVALID_TRANSITION",
    message: "That status change is not allowed.",
    status: 400,
  },
  DUE_DATE_REQUIRED: {
    code: "VALIDATION_ERROR",
    message: "Due date is required for assigned tasks.",
    status: 400,
  },
  REASON_REQUIRED: { code: "VALIDATION_ERROR", message: "A reason is required.", status: 400 },
  ASSIGNEE_REQUIRED: { code: "VALIDATION_ERROR", message: "Select an assignee.", status: 400 },
  INVALID_ASSIGNEE: {
    code: "VALIDATION_ERROR",
    message: "Select an active employee.",
    status: 400,
  },
  SELF_ASSIGN_ONLY: {
    code: "VALIDATION_ERROR",
    message: "A private to-do can only be assigned to you.",
    status: 400,
  },
  LINKED_RECORD_NOT_FOUND: {
    code: "NOT_FOUND",
    message: "The linked record was not found.",
    status: 404,
  },
  LINKED_RECORD_FORBIDDEN: {
    code: "FORBIDDEN",
    message: "You cannot link a record from a company you cannot access.",
    status: 403,
  },
  CANNOT_REASSIGN: {
    code: "FORBIDDEN",
    message: "You cannot reassign this task.",
    status: 403,
  },
  REASSIGNMENT_NOT_FOUND: {
    code: "NOT_FOUND",
    message: "Reassignment request not found.",
    status: 404,
  },
  REASSIGNMENT_NOT_PENDING: {
    code: "VALIDATION_ERROR",
    message: "This reassignment request has already been decided.",
    status: 400,
  },
  SYSTEM_TASK_EXISTS: {
    code: "DUPLICATE",
    message: "An active system task already exists for this trigger.",
    status: 409,
  },
  SYSTEM_TASK_PROTECTED: {
    code: "FORBIDDEN",
    message: "This system task cannot be changed that way.",
    status: 403,
  },
};

export function mapTaskError(error: unknown): NextResponse {
  if (error instanceof Error && ERROR_MAP[error.message]) {
    const mapped = ERROR_MAP[error.message];
    return taskError(mapped.code, mapped.message, mapped.status);
  }
  throw error;
}
