import { tryAuthenticateAutomationDevice } from "@/lib/automation-device-auth";
import { automationJsonError } from "@/lib/automation-api";
import { claimAutomationExecutionForDevice } from "@/lib/automation-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const device = await tryAuthenticateAutomationDevice(prisma, request.headers.get("authorization"));
  if (!device) return automationJsonError("Unauthorized.", 401);

  const claim = await claimAutomationExecutionForDevice(prisma, device);
  if (!claim) {
    return Response.json({ execution: null, attempts: [] });
  }
  return Response.json(claim);
}
