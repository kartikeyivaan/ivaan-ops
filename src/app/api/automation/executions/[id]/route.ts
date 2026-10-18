import { z } from "zod";
import { auth } from "@/lib/auth";
import { automationJsonError } from "@/lib/automation-api";
import { canRunAutomation, canViewAutomation } from "@/lib/automation-permissions";
import { cancelAutomationExecution, getAutomationExecution } from "@/lib/automation-service";
import { assertCompanyAccess } from "@/lib/customer-permissions";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";

async function assertExecutionAccess(
  executionId: string,
  roles: string[],
  sessionCompanyIds: string[],
) {
  const execution = await prisma.automationExecution.findUnique({
    where: { id: executionId },
    include: { companies: { select: { companyId: true } } },
  });
  if (!execution) return null;
  for (const row of execution.companies) {
    if (!assertCompanyAccess(roles, sessionCompanyIds, row.companyId)) {
      throw new Error("FORBIDDEN");
    }
  }
  return execution;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  const { id } = await context.params;
  try {
    await assertExecutionAccess(id, session.user.roles, getSessionCompanyIds(session));
  } catch {
    return automationJsonError("Forbidden.", 403);
  }

  const omitScreenshots = new URL(_request.url).searchParams.get("omitScreenshots") === "1";
  const execution = await getAutomationExecution(prisma, id, { omitScreenshots });
  if (!execution) return automationJsonError("Execution not found.", 404);
  return Response.json(execution);
}

const cancelSchema = z.object({
  reason: z.string().optional(),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || !canRunAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  const { id } = await context.params;
  try {
    await assertExecutionAccess(id, session.user.roles, getSessionCompanyIds(session));
  } catch {
    return automationJsonError("Forbidden.", 403);
  }

  const body = request.headers.get("content-length") === "0"
    ? {}
    : await request.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);

  try {
    await cancelAutomationExecution(prisma, {
      executionId: id,
      cancelledById: session.user.id,
      reason: parsed.success ? parsed.data.reason : undefined,
    });
    return Response.json({ ok: true });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "NOT_FOUND") {
      return automationJsonError("Execution not found.", 404);
    }
    if (cause instanceof Error && cause.message === "EXECUTION_NOT_CANCELLABLE") {
      return automationJsonError("This execution can no longer be cancelled.", 400);
    }
    throw cause;
  }
}
