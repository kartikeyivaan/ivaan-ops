import { NextResponse } from "next/server";
import { BankTransactionIssueStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { setReconciliationIssueStatus } from "@/lib/bank-reconciliation-service";
import {
  canIgnoreReconciliationIssues,
  canManageReconciliation,
} from "@/lib/banking-permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { bankReconciliationIssueUpdateSchema } from "@/lib/validations";

function error(message: string, status: number, code?: string) {
  return NextResponse.json({ message, code }, { status });
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !canManageReconciliation(session.user.roles)) {
    return error("Forbidden.", 403, "FORBIDDEN");
  }

  const companyId = requireActiveCompany(session);
  const { id } = await params;
  const body = await request.json();
  const parsed = bankReconciliationIssueUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return error("Invalid issue update.", 400, "VALIDATION_ERROR");
  }

  if (
    parsed.data.status === BankTransactionIssueStatus.IGNORED &&
    !canIgnoreReconciliationIssues(session.user.roles)
  ) {
    return error("Not authorized to ignore reconciliation issues.", 403, "FORBIDDEN");
  }

  try {
    const updated = await setReconciliationIssueStatus(prisma, {
      issueId: id,
      companyId,
      actorUserId: session.user.id,
      status: parsed.data.status,
      reason: parsed.data.reason,
    });
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      resolutionReason: updated.resolutionReason,
    });
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    switch (err.message) {
      case "NOT_FOUND":
        return error("Issue not found.", 404, "NOT_FOUND");
      case "FORBIDDEN_COMPANY":
        return error("Forbidden.", 403, "FORBIDDEN");
      case "REASON_REQUIRED":
        return error("A reason is required for this status change.", 400, "REASON_REQUIRED");
      default:
        throw err;
    }
  }
}
