import { AutomationQueueItemStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  assertAutomationCompanyIds,
  automationJsonError,
  parseAutomationCompanyIds,
} from "@/lib/automation-api";
import { canRunAutomation, canViewAutomation } from "@/lib/automation-permissions";
import { listAutomationQueue, syncAutomationQueueForCompanies } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";

const querySchema = z.object({
  companyIds: z.string().optional(),
  includeEarlyDcr: z.enum(["true", "false"]).optional(),
  status: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return automationJsonError("Invalid query.", 400);

  try {
    const companyIds = parseAutomationCompanyIds(
      params.data.companyIds,
      getSessionCompanyIds(session),
      session.user.roles,
    );
    if (!companyIds.length) return automationJsonError("No company scope.", 400);

    const statuses = params.data.status
      ? params.data.status.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const parsedStatuses = statuses?.filter((s): s is AutomationQueueItemStatus =>
      Object.values(AutomationQueueItemStatus).includes(s as AutomationQueueItemStatus),
    );

    const rows = await listAutomationQueue(prisma, {
      companyIds,
      includeEarlyDcr: params.data.includeEarlyDcr === "true",
      statuses: parsedStatuses?.length ? parsedStatuses : undefined,
    });
    return Response.json(rows);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "FORBIDDEN_COMPANY") {
      return automationJsonError("Forbidden for one or more companies.", 403);
    }
    throw cause;
  }
}

const syncSchema = z.object({
  companyIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canRunAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  const parsed = syncSchema.safeParse(await request.json());
  if (!parsed.success) return automationJsonError("Invalid sync request.", 400);

  try {
    assertAutomationCompanyIds(
      parsed.data.companyIds,
      getSessionCompanyIds(session),
      session.user.roles,
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message === "FORBIDDEN_COMPANY") {
      return automationJsonError("Forbidden for one or more companies.", 403);
    }
    throw cause;
  }

  const result = await syncAutomationQueueForCompanies(prisma, parsed.data.companyIds);
  return Response.json(result);
}
