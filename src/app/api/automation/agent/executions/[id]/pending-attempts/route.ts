import { tryAuthenticateAutomationDevice } from "@/lib/automation-device-auth";
import { automationJsonError } from "@/lib/automation-api";
import { listPendingAttemptsForAgentExecution } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const device = await tryAuthenticateAutomationDevice(prisma, request.headers.get("authorization"));
  if (!device) return automationJsonError("Unauthorized.", 401);

  const { id } = await context.params;
  try {
    const attempts = await listPendingAttemptsForAgentExecution(prisma, {
      executionId: id,
      deviceId: device.deviceId,
    });
    return Response.json({ attempts });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "NOT_FOUND") {
      return automationJsonError("Execution not found.", 404);
    }
    throw cause;
  }
}
