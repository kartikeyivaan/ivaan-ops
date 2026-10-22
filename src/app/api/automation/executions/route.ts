import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  assertAutomationCompanyIds,
  automationJsonError,
  parseAutomationCompanyIds,
} from "@/lib/automation-api";
import { canRunAutomation, canViewAutomation } from "@/lib/automation-permissions";
import {
  listRecentAutomationExecutions,
  startAutomationExecution,
} from "@/lib/automation-service";
import { DCR_PORTAL_STRATEGIES, DEFAULT_DCR_PORTAL_STRATEGY } from "@/lib/dcr-documentation-eligibility";
import { prisma } from "@/lib/prisma";
import { getSessionCompanyIds } from "@/lib/session";

const startSchema = z.object({
  companyIds: z.array(z.string().uuid()).min(1),
  portalStrategy: z.enum(DCR_PORTAL_STRATEGIES).default(DEFAULT_DCR_PORTAL_STRATEGY),
  includeEarlyDcr: z.boolean().optional().default(false),
  queueItemIds: z.array(z.string().uuid()).optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canViewAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  try {
    const companyIds = parseAutomationCompanyIds(
      new URL(request.url).searchParams.get("companyIds") ?? undefined,
      getSessionCompanyIds(session),
      session.user.roles,
    );
    return Response.json(await listRecentAutomationExecutions(prisma, { companyIds, limit: 30 }));
  } catch (cause) {
    if (cause instanceof Error && cause.message === "FORBIDDEN_COMPANY") {
      return automationJsonError("Forbidden for one or more companies.", 403);
    }
    throw cause;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canRunAutomation(session.user.roles)) {
    return automationJsonError("Forbidden.", 403);
  }

  const parsed = startSchema.safeParse(await request.json());
  if (!parsed.success) return automationJsonError("Invalid execution request.", 400);

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

  try {
    const execution = await startAutomationExecution(prisma, {
      initiatedById: session.user.id,
      companyIds: parsed.data.companyIds,
      portalStrategy: parsed.data.portalStrategy,
      includeEarlyDcr: parsed.data.includeEarlyDcr,
      queueItemIds: parsed.data.queueItemIds,
    });
    return Response.json(execution);
  } catch (cause) {
    const messages: Record<string, { message: string; status: number }> = {
      NO_RUNNABLE_ITEMS: { message: "No eligible queue lines to run.", status: 400 },
      COMPANY_IDS_REQUIRED: { message: "Select at least one company.", status: 400 },
      INVALID_PORTAL_STRATEGY: { message: "Invalid portal strategy.", status: 400 },
      DEMO_AUTOMATION_BLOCKED: {
        message: "DCR portal automation cannot run from the Ivaan Demo environment.",
        status: 403,
      },
    };
    if (cause instanceof Error && messages[cause.message]) {
      return automationJsonError(messages[cause.message].message, messages[cause.message].status);
    }
    throw cause;
  }
}
